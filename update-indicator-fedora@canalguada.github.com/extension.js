/* This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/* Forked Update Indicator extension for Fedora users from Ubuntu package found at
 * https://launchpad.net/~aegirxx-googlemail/+archive/gnome-shell-extensions
 * Requires : beesu
 */

const GLib      = imports.gi.GLib;
const Gio       = imports.gi.Gio;
const Lang      = imports.lang;
const Main      = imports.ui.main;
const Mainloop  = imports.mainloop;
const Panel     = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Shell     = imports.gi.Shell;
const St        = imports.gi.St;
const Tweener   = imports.ui.tweener;

const DEFAULT_TIMEOUT = "900";
//const COMMAND_CHECK   = "sh -c \"/usr/bin/aptitude --disable-columns -F '%p;%d' search '~U'\"";
//const COMMAND_UPDATE = "gksu \"apt-get update -y\"";
//const COMMAND_UPGRADE = "gksu \"apt-get upgrade -y\"";
const COMMAND_CHECK   = "sh -c \"yum -d 0 -e 0 check-update | grep -v ^$ | awk '{ print $1 }'\"";
const COMMAND_UPDATE = "beesu -c \"yum -y update\"";
//const COMMAND_UPGRADE = "gksu \"apt-get upgrade -y\"";


function UpdateButton(settingsFile) {
	this._init(settingsFile);
}

UpdateButton.prototype = {
	__proto__: PanelMenu.Button.prototype,

	_init: function(settingsFile) {
		PanelMenu.Button.prototype._init.call(this, 0.0);
		
		this._timeoutSource = -1;
		this._settingsFile = settingsFile;
		
		this._settings = null;
        if (this._settingsFile.query_exists(null)) {
            try {
                this._settings = JSON.parse(Shell.get_file_contents_utf8_sync(this._settingsFile.get_path()));
            } catch (e) {
                global.logError('Failed to parse ' + this._settingsFile.get_path() + ': ' + e);
                this._settings = null;
            }
        } 
        if(this._settings == null) {
            this._settings = {};
            this._updateSettings('timeout', DEFAULT_TIMEOUT);
        }
		
		this._label = new St.Label({
			text : "0 Updates"
		});
		this.actor.set_child(this._label);
		
		this._spinner = new Panel.AnimatedIcon('process-working.svg', Panel.PANEL_ICON_SIZE);
		this._spinner.actor.hide();
		this._anim = false;

		this._updatesMenuItem = new PopupMenu.PopupSubMenuMenuItem("0 Updates");
		this._updatesMenuItem.addActor(this._spinner.actor);

		this._refreshMenuItem = new PopupMenu.PopupMenuItem("Refresh");
		this._refreshMenuItem.connect('activate', Lang.bind(this, function() {
            this._startTimeout();
            this._checkUpdates();
            this._stopTimeout();
		}));

		this._updateMenuItem = new PopupMenu.PopupMenuItem("Update");
		this._updateMenuItem.connect('activate', Lang.bind(this, function() {this._doAsync(COMMAND_UPDATE);}));
		
//		this._upgradeMenuItem = new PopupMenu.PopupMenuItem("Upgrade");
//		this._upgradeMenuItem.connect('activate', Lang.bind(this, function() {this._doAsync(COMMAND_UPGRADE);}));
       
		this._settingsMenuItem = new PopupMenu.PopupSubMenuMenuItem("Settings");
		
        let	item1 = new PopupMenu.PopupMenuItem("Refresh Interval:", {activate:false, reactive:false});
  		this._settingsMenuItem.menu.addMenuItem(item1);
        this._timeoutEntry = new St.Entry({ 
            text : this._settings['timeout'], 
            name : "TimeoutEntry"
        });
		item1.addActor(this._timeoutEntry);
        let applyButton = new St.Button({
            style_class: 'notification-button',
            label     : 'Apply',
            reactive  : true,
            can_focus : true,
            });
        applyButton.connect('clicked', Lang.bind(this, function() {
            this._updateSettings('timeout', this._timeoutEntry.get_text());
            this._stopTimeout();
            this._startTimeout();
        }));
        item1.addActor(applyButton);
		
		this.menu.addMenuItem(this._updatesMenuItem);
		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		this.menu.addMenuItem(this._refreshMenuItem);
    	this.menu.addMenuItem(this._updateMenuItem);
//		this.menu.addMenuItem(this._upgradeMenuItem);
		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		this.menu.addMenuItem(this._settingsMenuItem);
		
		Main.panel._centerBox.add(this.actor);
		Main.panel._menus.addMenu(this.menu);
		
		this._checkUpdates();
		this._startTimeout();
	},
	
	_startTimeout: function() {
		this._timeoutSource = Mainloop.timeout_add_seconds(this._settings['timeout'], Lang.bind(this, this._checkUpdates));
	},
	
	_stopTimeout: function() {
		if(this._timeoutSource >= 0) {
			Mainloop.source_remove(this._timeoutSource);
		}		
	},
    
	_checkUpdates : function() {
		this._setEnabled(false);
		if(!this._anim) {
			this._anim = true;
			this._spinner.actor.show();
		}
		try {
			let [success, ret] = GLib.spawn_command_line_sync(COMMAND_CHECK);
			if(success) {
				let lines = ret.split('\n').slice(0, -1);
				let str = lines.length + " Updates";
				this._label.set_text(str);
				this._updatesMenuItem.label.set_text(str);

				this._updatesMenuItem.menu.removeAll();
				for(let i=0; i<lines.length; i++) {
//					cols = lines[i].split(';', 2);
//					
//					item = new PopupMenu.PopupMenuItem(cols[0], {
//						activate:false
//					});
//					item.actor.set_tooltip_text(cols[1]);
//					this._updatesMenuItem.menu.addMenuItem(item);
					item = new PopupMenu.PopupMenuItem(lines[i], {
						activate:false
					});
					this._updatesMenuItem.menu.addMenuItem(item);
				}
			} else {
				Main.notifyError("Test", "parse failed");
			}
		} catch (err) {
			Main.notifyError("Exception", err.message);
		}
		this._anim = false;
		Tweener.addTween(this._spinner.actor, {
			opacity: 0,
			time: Panel.SPINNER_ANIMATION_TIME,
			transition: "easeOutQuad",
			onCompleteScope: this,
			onComplete: function() {
				this._spinner.actor.opacity = 255;
				this._spinner.actor.hide();
			}
		});
		this._setEnabled(true);
		return true;
	},
	
	_doAsync: function(command) {
		this._stopTimeout();
		this._setEnabled(false);
		this._anim = true;
		this._spinner.actor.show();
		try {
			let dummy = 0;
			let [success, argc, argv] = GLib.shell_parse_argv(command);
			try {
				let ret = GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null, null, dummy);
				GLib.child_watch_add(GLib.PRIORITY_DEFAULT, ret[1], Lang.bind(this, this._childWatch), null, null);
			} catch (err) {
				Main.notifyError("Update Indicator:", err.message.replace(/[^:]*: /, "Could not upgrade command:" + "\n"));
				this._setEnabled(true);
			}
		} catch (err) {
			Main.notifyError("Update Indicator:", err.message.replace(/[^:]*: /, "Could not parse command:" + "\n"));
			this._setEnabled(true);
		}
	},
	
	_childWatch : function(pid, status, udata) {
		GLib.spawn_close_pid(pid);
		this._checkUpdates();
		this._setEnabled(true);
		this._startTimeout();
	},
	
	_setEnabled : function(enabled) {
		if(enabled) {
			this._updatesMenuItem.actor.remove_style_pseudo_class('disabled');
			this._refreshMenuItem.actor.remove_style_pseudo_class('disabled');
			this._updateMenuItem.actor.remove_style_pseudo_class('disabled');
//			this._upgradeMenuItem.actor.remove_style_pseudo_class('disabled');
			this._settingsMenuItem.actor.remove_style_pseudo_class('disabled');
		} else {
			this._updatesMenuItem.actor.add_style_pseudo_class('disabled');
			this._refreshMenuItem.actor.add_style_pseudo_class('disabled');
			this._updateMenuItem.actor.add_style_pseudo_class('disabled');
//			this._upgradeMenuItem.actor.add_style_pseudo_class('disabled');
			this._settingsMenuItem.actor.add_style_pseudo_class('disabled');
		}
		this._updatesMenuItem.actor.reactive = enabled;
		this._refreshMenuItem.actor.reactive = enabled;
		this._updateMenuItem.actor.reactive = enabled;
//		this._upgradeMenuItem.actor.reactive = enabled;
		this._settingsMenuItem.actor.reactive = enabled;
	},
	
	_updateSettings: function(key, val) {
	    this._settings[key] = val;
        let raw = this._settingsFile.replace(null, false, Gio.FileCreateFlags.NONE, null);
        let out = Gio.BufferedOutputStream.new_sized (raw, 4096);
        Shell.write_string_to_stream (out, JSON.stringify(this._settings));
        out.close(null);
	}
};
 
function main(extensionMeta) {

    //extensionMeta.path may be not user-writable if the extension is located at /usr/local/... or something
    let pathString = global.userdatadir + '/extensions/' + extensionMeta.uuid+'/';
    let path = Gio.file_new_for_path(pathString);
    if(!path.query_exists(null)) {
        path.make_directory_with_parents(null);
    }
    let settingsFile = Gio.file_new_for_path(pathString + 'settings.json');
	new UpdateButton(settingsFile);
}
