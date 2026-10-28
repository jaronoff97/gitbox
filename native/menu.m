#import <AppKit/AppKit.h>

// Gitbox's native menu bar (#7). gpuix-svelte has no menu API, so this loads over FFI, as
// gpuix-svelte's examples/liquid-glass-ffi does: src/menubar.ts compiles it in development and
// build.ts puts it in Gitbox.app. JS describes the menus as JSON (gitbox_menu_set); a click puts
// the item's command id in a queue, which JS polls (gitbox_menu_poll), so AppKit never calls JS.
//
// JSON: [{ "title": "File", "items": [{ "id", "title", "keys", "hint", "checked", "enabled", "role", "sep" }] }]
//   keys  – a key equivalent, GPUI syntax ("shift-cmd-c"): the menu owns that shortcut
//   hint  – a shortcut shown at the right of the title only (single keys, keys a text field needs)
//   role  – a standard item: about, services, hide, hideOthers, showAll, quit, close, undo, redo,
//           cut, copy, paste, selectAll, minimize, zoom, front, fullscreen (AppKit adds its own
//           Enter Full Screen to a menu titled View, so Gitbox doesn't)

static NSMutableArray<NSString *> *queue;
static char *polled = NULL;

@interface GitboxMenuTarget : NSObject
@end

@implementation GitboxMenuTarget
- (void)fire:(NSMenuItem *)item {
	@synchronized (queue) {
		[queue addObject:item.representedObject];
	}
}
// Menus autoenable, so AppKit asks; a command item is enabled as the JSON said (its tag).
- (BOOL)validateMenuItem:(NSMenuItem *)item {
	return item.tag == 1;
}
@end

static GitboxMenuTarget *target;

static NSString *char_string(unichar c) {
	return [NSString stringWithCharacters:&c length:1];
}

static void set_keys(NSMenuItem *item, NSString *keys) {
	NSArray<NSString *> *parts = [keys componentsSeparatedByString:@"-"];
	NSString *key = [keys hasSuffix:@"--"] ? @"-" : parts.lastObject;
	NSEventModifierFlags mods = 0;
	for (NSString *p in parts) {
		if ([p isEqualToString:@"cmd"]) mods |= NSEventModifierFlagCommand;
		else if ([p isEqualToString:@"shift"]) mods |= NSEventModifierFlagShift;
		else if ([p isEqualToString:@"alt"]) mods |= NSEventModifierFlagOption;
		else if ([p isEqualToString:@"ctrl"]) mods |= NSEventModifierFlagControl;
	}
	NSDictionary<NSString *, NSString *> *named = @{
		@"enter": @"\r",
		@"escape": @"\e",
		@"tab": @"\t",
		@"space": @" ",
		@"backspace": @"\b",
		@"delete": char_string(NSDeleteCharacter),
		@"up": char_string(NSUpArrowFunctionKey),
		@"down": char_string(NSDownArrowFunctionKey),
		@"left": char_string(NSLeftArrowFunctionKey),
		@"right": char_string(NSRightArrowFunctionKey),
		@"f10": char_string(NSF10FunctionKey),
	};
	item.keyEquivalent = named[key] ?: key;
	item.keyEquivalentModifierMask = mods;
}

/** "Next Card" with "J" at the right, in the menu's grey: a shortcut the menu shows but doesn't own. */
static void set_hint(NSMenuItem *item, NSString *title, NSString *hint) {
	NSMutableParagraphStyle *style = [NSMutableParagraphStyle new];
	style.tabStops = @[ [[NSTextTab alloc] initWithTextAlignment:NSTextAlignmentRight location:240 options:@{}] ];
	NSFont *font = [NSFont menuFontOfSize:0];
	NSMutableAttributedString *text = [[NSMutableAttributedString alloc]
		initWithString:[NSString stringWithFormat:@"%@\t%@", title, hint]
		    attributes:@{ NSParagraphStyleAttributeName: style, NSFontAttributeName: font }];
	[text addAttribute:NSForegroundColorAttributeName
	             value:NSColor.secondaryLabelColor
	             range:NSMakeRange(title.length + 1, hint.length)];
	item.attributedTitle = text;
}

static NSMenuItem *role_item(NSString *role, NSString *title) {
	// target nil: the first responder (the window, a text field) answers, as in any Mac app.
	NSDictionary<NSString *, NSArray *> *roles = @{
		@"about": @[ @"orderFrontStandardAboutPanel:", @"", @YES ],
		@"hide": @[ @"hide:", @"cmd-h", @YES ],
		@"hideOthers": @[ @"hideOtherApplications:", @"alt-cmd-h", @YES ],
		@"showAll": @[ @"unhideAllApplications:", @"", @YES ],
		@"quit": @[ @"terminate:", @"cmd-q", @YES ],
		@"close": @[ @"performClose:", @"cmd-w", @NO ],
		@"undo": @[ @"undo:", @"", @NO ],
		@"redo": @[ @"redo:", @"", @NO ],
		@"cut": @[ @"cut:", @"", @NO ],
		@"copy": @[ @"copy:", @"", @NO ],
		@"paste": @[ @"paste:", @"", @NO ],
		@"selectAll": @[ @"selectAll:", @"", @NO ],
		@"minimize": @[ @"performMiniaturize:", @"cmd-m", @NO ],
		@"zoom": @[ @"performZoom:", @"", @NO ],
		@"front": @[ @"arrangeInFront:", @"", @YES ],
		@"fullscreen": @[ @"toggleFullScreen:", @"ctrl-cmd-f", @NO ],
	};
	NSArray *r = roles[role];
	if (!r) return nil;
	NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:NSSelectorFromString(r[0]) keyEquivalent:@""];
	if ([r[1] length]) set_keys(item, r[1]);
	if ([r[2] boolValue]) item.target = NSApp;
	return item;
}

static NSMenuItem *build_item(NSDictionary *spec) {
	if ([spec[@"sep"] boolValue]) return [NSMenuItem separatorItem];
	NSString *title = spec[@"title"] ?: @"";
	NSString *role = spec[@"role"];
	if ([role isEqualToString:@"services"]) {
		NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:nil keyEquivalent:@""];
		NSMenu *services = [[NSMenu alloc] initWithTitle:title];
		item.submenu = services;
		NSApp.servicesMenu = services;
		return item;
	}
	NSMenuItem *item = role ? role_item(role, title) : nil;
	if (!item) {
		item = [[NSMenuItem alloc] initWithTitle:title action:@selector(fire:) keyEquivalent:@""];
		item.target = target;
		item.representedObject = spec[@"id"];
		item.tag = [spec[@"enabled"] boolValue] ? 1 : 0;
		if ([spec[@"keys"] isKindOfClass:NSString.class]) set_keys(item, spec[@"keys"]);
		if ([spec[@"checked"] boolValue]) item.state = NSControlStateValueOn;
	}
	if ([spec[@"hint"] isKindOfClass:NSString.class]) set_hint(item, title, spec[@"hint"]);
	return item;
}

static void install(NSArray *menus) {
	NSMenu *bar = [[NSMenu alloc] initWithTitle:@"Main"];
	for (NSDictionary *m in menus) {
		NSMenu *menu = [[NSMenu alloc] initWithTitle:m[@"title"]];
		for (NSDictionary *spec in m[@"items"]) [menu addItem:build_item(spec)];
		NSMenuItem *holder = [[NSMenuItem alloc] initWithTitle:m[@"title"] action:nil keyEquivalent:@""];
		holder.submenu = menu;
		[bar addItem:holder];
		if ([m[@"title"] isEqualToString:@"Window"]) NSApp.windowsMenu = menu;
		if ([m[@"title"] isEqualToString:@"Help"]) NSApp.helpMenu = menu;
	}
	NSApp.mainMenu = bar;
}

/** The menus' shape: titles, ids, roles and separators, in order. */
static NSString *shape(NSArray *menus) {
	NSMutableString *s = [NSMutableString string];
	for (NSDictionary *m in menus) {
		[s appendFormat:@"[%@", m[@"title"]];
		for (NSDictionary *it in m[@"items"]) [s appendFormat:@"|%@%@%@", it[@"id"] ?: @"", it[@"role"] ?: @"", it[@"sep"] ? @"-" : @""];
		[s appendString:@"]"];
	}
	return s;
}

static NSMenuItem *find(NSMenu *menu, NSString *id);

/** Same shape: only enabled and checked change, in place. AppKit adds its own items (Emoji & Symbols,
 * Dictation…) to the Edit menu, so a menu bar rebuilt on every change collects copies of them. */
static void refresh(NSArray *menus) {
	for (NSDictionary *m in menus)
		for (NSDictionary *spec in m[@"items"]) {
			if (!spec[@"id"]) continue;
			NSMenuItem *item = find(NSApp.mainMenu, spec[@"id"]);
			item.tag = [spec[@"enabled"] boolValue] ? 1 : 0;
			item.state = [spec[@"checked"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
		}
}

static NSString *installed_shape = nil;

static void apply(NSArray *menus) {
	NSString *s = shape(menus);
	if ([s isEqualToString:installed_shape]) return refresh(menus);
	install(menus);
	installed_shape = s;
}

/** Sets the menu bar (rebuilt only when its shape changes); returns the number of menus, or -1 if the
 * JSON doesn't parse. */
int gitbox_menu_set(const char *json) {
	if (!queue) {
		queue = [NSMutableArray array];
		target = [GitboxMenuTarget new];
	}
	NSData *data = [NSData dataWithBytes:json length:strlen(json)];
	NSArray *menus = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
	if (![menus isKindOfClass:NSArray.class]) return -1;
	if (NSThread.isMainThread) apply(menus);
	else dispatch_async(dispatch_get_main_queue(), ^{ apply(menus); });
	return (int)menus.count;
}

/** The next clicked command id, or NULL; the string lives until the next call. */
const char *gitbox_menu_poll(void) {
	free(polled);
	polled = NULL;
	if (!queue) return NULL;
	@synchronized (queue) {
		if (!queue.count) return NULL;
		polled = strdup(queue.firstObject.UTF8String);
		[queue removeObjectAtIndex:0];
	}
	return polled;
}

static NSMenuItem *find(NSMenu *menu, NSString *id) {
	for (NSMenuItem *item in menu.itemArray) {
		if ([item.representedObject isEqual:id]) return item;
		NSMenuItem *inner = item.submenu ? find(item.submenu, id) : nil;
		if (inner) return inner;
	}
	return nil;
}

// For checks (GITBOX_MENU_DEBUG in src/menubar.ts): what the menu bar holds, and a click on an item.

/** The menu bar now, as "File: Refresh ⌘R, …" lines; the string lives until the next call. */
const char *gitbox_menu_describe(void) {
	static char *text = NULL;
	free(text);
	NSMutableString *out = [NSMutableString string];
	for (NSMenuItem *holder in NSApp.mainMenu.itemArray) {
		NSMutableArray *names = [NSMutableArray array];
		for (NSMenuItem *item in holder.submenu.itemArray) {
			if (item.isSeparatorItem) continue;
			[names addObject:[NSString stringWithFormat:@"%@%@%@", item.title,
				item.keyEquivalent.length ? [NSString stringWithFormat:@" [%@]", item.keyEquivalent] : @"",
				item.state == NSControlStateValueOn ? @" ✓" : @""]];
		}
		[out appendFormat:@"%@: %@\n", holder.title, [names componentsJoinedByString:@", "]];
	}
	text = strdup(out.UTF8String);
	return text;
}

/** Clicks the item for command `id` as a user would; returns whether it was found. */
int gitbox_menu_perform(const char *id) {
	NSMenuItem *item = find(NSApp.mainMenu, [NSString stringWithUTF8String:id]);
	if (!item) return 0;
	[item.menu performActionForItemAtIndex:[item.menu indexOfItem:item]];
	return 1;
}
