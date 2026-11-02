#import <AppKit/AppKit.h>
#import <UserNotifications/UserNotifications.h>

// Native macOS notifications (#35), in the same library as the menu bar (menu.m), loaded over FFI by
// src/menubar.ts. JS posts one with gitbox_notify_post; a click puts the notification's URL in a
// queue, which JS polls (gitbox_notify_poll), as it polls menu clicks, so the center never calls JS.
// The app's bundle needs its own signature (ad hoc is enough) and must not run from /tmp, or macOS
// refuses: dev.ts signs Gitbox Dev.app, build.ts Gitbox.app.

static NSMutableArray<NSString *> *clicks;
static char *polled = NULL;
/** -1 not asked yet, 0 refused, 1 allowed; and why it was refused. */
static int allowed = -1;
static char reason[512] = "";

@interface GitboxNotifyDelegate : NSObject <UNUserNotificationCenterDelegate>
@end

@implementation GitboxNotifyDelegate
// While Gitbox is in front, a notification still shows as a banner.
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))done {
	done(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList | UNNotificationPresentationOptionSound);
}
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))done {
	NSString *url = response.notification.request.content.userInfo[@"url"];
	if ([url isKindOfClass:NSString.class]) @synchronized (clicks) { [clicks addObject:url]; }
	done();
}
@end

static GitboxNotifyDelegate *delegate;

/** Takes the center's clicks, at launch: a click on an earlier notification starts or reaches Gitbox. */
void gitbox_notify_listen(void) {
	if (delegate) return;
	clicks = [NSMutableArray array];
	delegate = [GitboxNotifyDelegate new];
	UNUserNotificationCenter.currentNotificationCenter.delegate = delegate;
}

/** Asks macOS for permission (it prompts the first time only); the answer arrives later, as
 * gitbox_notify_allowed reports. */
void gitbox_notify_init(void) {
	gitbox_notify_listen();
	[UNUserNotificationCenter.currentNotificationCenter
		requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound)
		              completionHandler:^(BOOL granted, NSError *error) {
			              allowed = granted ? 1 : 0;
			              snprintf(reason, sizeof reason, "%s", error ? error.localizedDescription.UTF8String : "");
		              }];
}

/** -1 not answered yet, 0 refused (gitbox_notify_reason says why, if macOS did), 1 allowed. */
int gitbox_notify_allowed(void) { return allowed; }
const char *gitbox_notify_reason(void) { return reason; }

/** Shows a notification. `id` replaces an earlier one with the same id; `group` stacks them in
 * Notification Center (the repository); a click on it queues `url`. Empty strings are left out. */
void gitbox_notify_post(const char *id, const char *title, const char *subtitle, const char *body, const char *group, const char *url) {
	gitbox_notify_listen();
	UNMutableNotificationContent *content = [UNMutableNotificationContent new];
	content.title = [NSString stringWithUTF8String:title];
	if (*subtitle) content.subtitle = [NSString stringWithUTF8String:subtitle];
	content.body = [NSString stringWithUTF8String:body];
	if (*group) content.threadIdentifier = [NSString stringWithUTF8String:group];
	if (*url) content.userInfo = @{ @"url": [NSString stringWithUTF8String:url] };
	content.sound = UNNotificationSound.defaultSound;
	UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:[NSString stringWithUTF8String:id] content:content trigger:nil];
	[UNUserNotificationCenter.currentNotificationCenter addNotificationRequest:request withCompletionHandler:nil];
}

/** The next clicked notification's URL, or NULL; the string lives until the next call. */
const char *gitbox_notify_poll(void) {
	free(polled);
	polled = NULL;
	if (!clicks) return NULL;
	@synchronized (clicks) {
		if (!clicks.count) return NULL;
		polled = strdup(clicks.firstObject.UTF8String);
		[clicks removeObjectAtIndex:0];
	}
	return polled;
}
