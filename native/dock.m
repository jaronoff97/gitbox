#import <AppKit/AppKit.h>

// The Dock icon's badge: how many notifications are still open (src/Board.svelte counts them), in
// the same library as the menu bar and notifications, loaded over FFI by src/menubar.ts.

/** Sets the badge's text; an empty one takes it away. */
void gitbox_dock_badge(const char *label) {
	NSString *text = [NSString stringWithUTF8String:label];
	dispatch_async(dispatch_get_main_queue(), ^{
		NSApp.dockTile.badgeLabel = text.length ? text : nil;
	});
}
