#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

static int FindAvailablePort(void) {
  int socketFileDescriptor = socket(AF_INET, SOCK_STREAM, 0);
  if (socketFileDescriptor < 0) {
    return 8765;
  }

  int value = 1;
  setsockopt(socketFileDescriptor, SOL_SOCKET, SO_REUSEADDR, &value, sizeof(value));

  struct sockaddr_in address;
  memset(&address, 0, sizeof(address));
  address.sin_len = sizeof(address);
  address.sin_family = AF_INET;
  address.sin_port = htons(0);
  address.sin_addr.s_addr = inet_addr("127.0.0.1");

  if (bind(socketFileDescriptor, (struct sockaddr *)&address, sizeof(address)) != 0) {
    close(socketFileDescriptor);
    return 8765;
  }

  socklen_t length = sizeof(address);
  if (getsockname(socketFileDescriptor, (struct sockaddr *)&address, &length) != 0) {
    close(socketFileDescriptor);
    return 8765;
  }

  int port = ntohs(address.sin_port);
  close(socketFileDescriptor);
  return port;
}

@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) NSTask *serverTask;
@property(nonatomic, strong) NSTimer *readinessTimer;
@property(nonatomic, strong) NSMutableArray<NSString *> *recentLogs;
@property(nonatomic, strong) id eventMonitor;
@property(nonatomic, assign) NSInteger readinessAttempts;
@property(nonatomic, assign) int port;
@end

@implementation AppDelegate

- (NSString *)nativeLogPath {
  return @"/tmp/cola-switch-native.log";
}

- (void)appendNativeLog:(NSString *)message {
  if (message.length == 0) {
    return;
  }

  NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
  formatter.dateFormat = @"yyyy-MM-dd HH:mm:ss.SSS";
  NSString *timestamp = [formatter stringFromDate:[NSDate date]];
  NSString *line = [NSString stringWithFormat:@"[%@] %@\n", timestamp, message];
  NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:[self nativeLogPath]];
  if (handle == nil) {
    [line writeToFile:[self nativeLogPath] atomically:YES encoding:NSUTF8StringEncoding error:nil];
    return;
  }
  @try {
    [handle seekToEndOfFile];
    [handle writeData:[line dataUsingEncoding:NSUTF8StringEncoding]];
    [handle closeFile];
  } @catch (__unused NSException *exception) {
  }
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _port = FindAvailablePort();
    _recentLogs = [NSMutableArray array];
    [[NSFileManager defaultManager] removeItemAtPath:[self nativeLogPath] error:nil];
    [self appendNativeLog:[NSString stringWithFormat:@"app init port=%d", _port]];
  }
  return self;
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  [self setUpMenu];
  [self setUpWindow];
  [self showLoading:@"正在启动 Cola Switch…"];
  [self startServer];
  [self beginReadinessPolling];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
  return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
  [self.readinessTimer invalidate];
  self.readinessTimer = nil;

  if (self.eventMonitor != nil) {
    [NSEvent removeMonitor:self.eventMonitor];
    self.eventMonitor = nil;
  }

  if (self.serverTask && self.serverTask.isRunning) {
    [self.serverTask terminate];
  }
}

- (void)setUpMenu {
  NSMenu *mainMenu = [[NSMenu alloc] init];
  NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
  [mainMenu addItem:appMenuItem];

  NSMenu *appMenu = [[NSMenu alloc] init];
  appMenuItem.submenu = appMenu;

  NSString *appName = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleName"] ?: @"Cola Switch";
  [appMenu addItemWithTitle:[NSString stringWithFormat:@"关于 %@", appName]
                     action:@selector(orderFrontStandardAboutPanel:)
              keyEquivalent:@""];
  [appMenu addItem:[NSMenuItem separatorItem]];

  NSMenuItem *reloadItem = [[NSMenuItem alloc] initWithTitle:@"重新加载"
                                                      action:@selector(reloadPage)
                                               keyEquivalent:@"r"];
  reloadItem.keyEquivalentModifierMask = NSEventModifierFlagCommand;
  reloadItem.target = self;
  [appMenu addItem:reloadItem];

  [appMenu addItem:[NSMenuItem separatorItem]];
  [appMenu addItemWithTitle:[NSString stringWithFormat:@"退出 %@", appName]
                     action:@selector(terminate:)
              keyEquivalent:@"q"];

  [NSApp setMainMenu:mainMenu];
}

- (void)setUpWindow {
  WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
  configuration.defaultWebpagePreferences.allowsContentJavaScript = YES;
  [configuration.userContentController addScriptMessageHandler:self name:@"colaStatus"];

  self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
  self.webView.navigationDelegate = self;
  self.webView.UIDelegate = self;
  self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

  NSRect frame = NSMakeRect(0, 0, 1180, 820);
  self.window = [[NSWindow alloc] initWithContentRect:frame
                                            styleMask:(NSWindowStyleMaskTitled |
                                                       NSWindowStyleMaskClosable |
                                                       NSWindowStyleMaskMiniaturizable |
                                                       NSWindowStyleMaskResizable)
                                              backing:NSBackingStoreBuffered
                                                defer:NO];
  [self.window center];
  self.window.title = @"Cola Switch";
  self.window.contentView = self.webView;
  [self.window makeKeyAndOrderFront:nil];
  self.webView.frame = self.window.contentView.bounds;
  __weak typeof(self) weakSelf = self;
  self.eventMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseDown handler:^NSEvent * _Nullable(NSEvent * _Nonnull event) {
    NSPoint location = [event locationInWindow];
    [weakSelf appendNativeLog:[NSString stringWithFormat:@"native-mousedown x=%.1f y=%.1f", location.x, location.y]];
    return event;
  }];
}

- (void)reloadPage {
  [self appendNativeLog:@"menu reload triggered"];
  [self.webView reload];
}

- (void)showNativeAlertWithMessage:(NSString *)message {
  if (message.length == 0) {
    return;
  }

  [self appendNativeLog:[NSString stringWithFormat:@"native alert: %@", message]];
  NSAlert *alert = [[NSAlert alloc] init];
  alert.messageText = @"Cola Switch";
  alert.informativeText = message;
  [alert addButtonWithTitle:@"知道了"];
  [alert beginSheetModalForWindow:self.window completionHandler:nil];
}

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
  if (![message.name isEqualToString:@"colaStatus"] || ![message.body isKindOfClass:[NSDictionary class]]) {
    return;
  }

  NSDictionary *body = (NSDictionary *)message.body;
  NSString *type = [body[@"type"] isKindOfClass:[NSString class]] ? body[@"type"] : @"";
  NSString *text = [body[@"message"] isKindOfClass:[NSString class]] ? body[@"message"] : @"";
  [self appendNativeLog:[NSString stringWithFormat:@"script-message type=%@ text=%@", type, text]];

  if ([type isEqualToString:@"progress"]) {
    self.window.title = @"Cola Switch · 切换中";
    return;
  }

  if ([type isEqualToString:@"debug"]) {
    self.window.title = @"Cola Switch · 已点击";
    return;
  }

  self.window.title = @"Cola Switch";
  if ([type isEqualToString:@"success"] || [type isEqualToString:@"error"]) {
    [self showNativeAlertWithMessage:text];
  }
}

- (void)startServer {
  NSURL *resourcesURL = [NSBundle mainBundle].resourceURL;
  if (resourcesURL == nil) {
    [self showErrorWithTitle:@"资源目录丢失" message:@"Bundle 没有拿到 Resources 目录。"];
    return;
  }

  NSString *serverPath = [[resourcesURL URLByAppendingPathComponent:@"server.js"] path];
  NSString *nodePath = [self bundledNodePathFromResources:resourcesURL];

  self.serverTask = [[NSTask alloc] init];
  if (nodePath.length > 0 && [[NSFileManager defaultManager] isExecutableFileAtPath:nodePath]) {
    self.serverTask.launchPath = nodePath;
    self.serverTask.arguments = @[ serverPath ];
  } else {
    self.serverTask.launchPath = @"/usr/bin/env";
    self.serverTask.arguments = @[ @"node", serverPath ];
  }

  NSMutableDictionary *environment = [NSMutableDictionary dictionaryWithDictionary:[NSProcessInfo processInfo].environment];
  environment[@"COLA_SWITCH_HOST"] = @"127.0.0.1";
  environment[@"COLA_SWITCH_PORT"] = [NSString stringWithFormat:@"%d", self.port];
  self.serverTask.environment = environment;
  self.serverTask.currentDirectoryPath = resourcesURL.path;
  [self appendNativeLog:[NSString stringWithFormat:@"starting server launchPath=%@ cwd=%@ port=%d", self.serverTask.launchPath, self.serverTask.currentDirectoryPath, self.port]];

  NSPipe *pipe = [NSPipe pipe];
  self.serverTask.standardOutput = pipe;
  self.serverTask.standardError = pipe;

  __weak typeof(self) weakSelf = self;
  pipe.fileHandleForReading.readabilityHandler = ^(NSFileHandle *handle) {
    NSData *data = handle.availableData;
    if (data.length == 0) {
      return;
    }
    NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (text.length == 0) {
      return;
    }

    dispatch_async(dispatch_get_main_queue(), ^{
      [weakSelf appendLogs:text];
      [weakSelf appendNativeLog:[NSString stringWithFormat:@"server stdout: %@", [text stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]]]];
    });
  };

  self.serverTask.terminationHandler = ^(NSTask *task) {
    dispatch_async(dispatch_get_main_queue(), ^{
      weakSelf.serverTask = nil;
      [weakSelf appendNativeLog:[NSString stringWithFormat:@"server terminated status=%d", task.terminationStatus]];
      if (weakSelf.webView.URL == nil) {
        NSString *logs = weakSelf.recentLogs.count > 0 ? [weakSelf.recentLogs componentsJoinedByString:@"\n"] : @"无";
        [weakSelf showErrorWithTitle:@"本地服务提前退出"
                             message:[NSString stringWithFormat:@"server.js 没有成功跑起来。\n\n最近日志：\n%@", logs]];
      }
    });
  };

  @try {
    [self.serverTask launch];
    [self appendNativeLog:@"server launch success"];
  } @catch (NSException *exception) {
    [self appendNativeLog:[NSString stringWithFormat:@"server launch failed: %@", exception.reason ?: @"unknown"]];
    [self showErrorWithTitle:@"启动失败"
                     message:[NSString stringWithFormat:@"无法启动内置 Node 服务。\n\n%@", exception.reason ?: @"未知异常"]];
  }
}

- (void)beginReadinessPolling {
  self.readinessAttempts = 0;
  [self.readinessTimer invalidate];
  self.readinessTimer = [NSTimer scheduledTimerWithTimeInterval:0.25
                                                         target:self
                                                       selector:@selector(checkReadiness)
                                                       userInfo:nil
                                                        repeats:YES];
}

- (void)checkReadiness {
  self.readinessAttempts += 1;
  if (self.readinessAttempts > 80) {
    [self.readinessTimer invalidate];
    self.readinessTimer = nil;
    NSString *logs = self.recentLogs.count > 0 ? [self.recentLogs componentsJoinedByString:@"\n"] : @"无";
    [self showErrorWithTitle:@"启动超时"
                     message:[NSString stringWithFormat:@"Cola Switch 本地服务在 20 秒内没有返回。\n\n最近日志：\n%@", logs]];
    return;
  }

  NSString *statusURLString = [NSString stringWithFormat:@"http://127.0.0.1:%d/api/status", self.port];
  NSURL *url = [NSURL URLWithString:statusURLString];
  if (url == nil) {
    return;
  }

  NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithURL:url
                                                           completionHandler:^(__unused NSData *data, NSURLResponse *response, __unused NSError *error) {
    NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
    if (![httpResponse isKindOfClass:[NSHTTPURLResponse class]] || httpResponse.statusCode != 200) {
      return;
    }

    dispatch_async(dispatch_get_main_queue(), ^{
      [self.readinessTimer invalidate];
      self.readinessTimer = nil;
      [self appendNativeLog:@"readiness check succeeded"];
      [self loadMainPage];
    });
  }];
  [task resume];
}

- (void)loadMainPage {
  NSString *urlString = [NSString stringWithFormat:@"http://127.0.0.1:%d", self.port];
  NSURL *url = [NSURL URLWithString:urlString];
  if (url == nil) {
    return;
  }
  [self appendNativeLog:[NSString stringWithFormat:@"loading main page %@", urlString]];
  [self.webView loadRequest:[NSURLRequest requestWithURL:url]];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
  [self appendNativeLog:[NSString stringWithFormat:@"webview finished navigation url=%@", webView.URL.absoluteString ?: @""]];
}

- (void)webView:(WKWebView *)webView runJavaScriptAlertPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(void))completionHandler {
  [self appendNativeLog:[NSString stringWithFormat:@"js alert: %@", message]];
  [self showNativeAlertWithMessage:message];
  if (completionHandler) {
    completionHandler();
  }
}

- (NSString *)bundledNodePathFromResources:(NSURL *)resourcesURL {
  NSURL *contentsURL = [resourcesURL URLByDeletingLastPathComponent];
  NSString *bundledNodePath = [[contentsURL URLByAppendingPathComponent:@"bin/node"] path];
  if (bundledNodePath.length > 0 && [[NSFileManager defaultManager] isExecutableFileAtPath:bundledNodePath]) {
    return bundledNodePath;
  }

  NSURL *nodePathURL = [resourcesURL URLByAppendingPathComponent:@"node-path.txt"];
  NSError *error = nil;
  NSString *contents = [NSString stringWithContentsOfURL:nodePathURL encoding:NSUTF8StringEncoding error:&error];
  if (contents.length == 0) {
    return nil;
  }
  return [contents stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
}

- (void)appendLogs:(NSString *)text {
  NSArray<NSString *> *lines = [text componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]];
  for (NSString *line in lines) {
    NSString *trimmed = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (trimmed.length == 0) {
      continue;
    }
    [self.recentLogs addObject:trimmed];
  }

  if (self.recentLogs.count > 12) {
    NSRange range = NSMakeRange(0, self.recentLogs.count - 12);
    [self.recentLogs removeObjectsInRange:range];
  }
}

- (NSString *)escapeHTML:(NSString *)value {
  NSString *escaped = [value stringByReplacingOccurrencesOfString:@"&" withString:@"&amp;"];
  escaped = [escaped stringByReplacingOccurrencesOfString:@"<" withString:@"&lt;"];
  escaped = [escaped stringByReplacingOccurrencesOfString:@">" withString:@"&gt;"];
  escaped = [escaped stringByReplacingOccurrencesOfString:@"\n" withString:@"<br>"];
  return escaped;
}

- (void)showLoading:(NSString *)message {
  NSString *html = [NSString stringWithFormat:
    @"<!doctype html>"
     "<html lang='zh-CN'>"
      "<head>"
       "<meta charset='utf-8'>"
       "<meta name='viewport' content='width=device-width, initial-scale=1'>"
       "<style>"
        "body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top left, rgba(178,85,47,0.12), transparent 28%%),linear-gradient(180deg, #f7f3ec 0%%, #f0eadf 100%%);font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#171411;}"
        ".card{width:min(520px, calc(100vw - 48px));padding:28px;border-radius:26px;border:1px solid rgba(35,25,15,0.12);background:rgba(255,252,246,0.9);box-shadow:0 24px 56px rgba(40,24,12,0.09);}"
        ".kicker{margin:0 0 10px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#b2552f;}"
        "h1{margin:0;font-size:34px;line-height:1.04;letter-spacing:-0.04em;}"
        "p{margin:14px 0 0;color:#685c50;line-height:1.7;}"
       "</style>"
      "</head>"
      "<body>"
       "<div class='card'>"
        "<p class='kicker'>Cola Switch</p>"
        "<h1>%@</h1>"
        "<p>应用正在拉起本地服务，正常情况下几秒内就会进入主界面。</p>"
       "</div>"
      "</body>"
     "</html>", [self escapeHTML:message]];

  [self.webView loadHTMLString:html baseURL:nil];
}

- (void)showErrorWithTitle:(NSString *)title message:(NSString *)message {
  NSString *html = [NSString stringWithFormat:
    @"<!doctype html>"
     "<html lang='zh-CN'>"
      "<head>"
       "<meta charset='utf-8'>"
       "<meta name='viewport' content='width=device-width, initial-scale=1'>"
       "<style>"
        "body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(180deg, #f8f3ec 0%%, #f1e7db 100%%);font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#171411;}"
        ".card{width:min(620px, calc(100vw - 48px));padding:28px;border-radius:26px;border:1px solid rgba(135,52,24,0.16);background:rgba(255,248,244,0.94);box-shadow:0 24px 56px rgba(40,24,12,0.09);}"
        ".kicker{margin:0 0 10px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#b2552f;}"
        "h1{margin:0;font-size:34px;line-height:1.04;letter-spacing:-0.04em;}"
        "p{margin:14px 0 0;color:#5e4d42;line-height:1.75;}"
       "</style>"
      "</head>"
      "<body>"
       "<div class='card'>"
        "<p class='kicker'>Cola Switch</p>"
        "<h1>%@</h1>"
        "<p>%@</p>"
       "</div>"
      "</body>"
     "</html>", [self escapeHTML:title], [self escapeHTML:message]];

  [self.webView loadHTMLString:html baseURL:nil];
}

@end

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSApplication *application = [NSApplication sharedApplication];
    AppDelegate *delegate = [[AppDelegate alloc] init];
    application.activationPolicy = NSApplicationActivationPolicyRegular;
    application.delegate = delegate;
    [application activateIgnoringOtherApps:YES];
    [application run];
  }
  return 0;
}
