// Loads the Cornerstone preferences page and binds the Action Center rows
// against in-memory settings. Spawned by the prefs scenario so GTK only
// ever talks to the nested compositor.
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import System from 'system'

// Checked before GTK or libadwaita is loaded: anything else could reach the
// live display.
const DISPLAY_NAME = 'cornerstone-nested'
const runtime = GLib.getenv('XDG_RUNTIME_DIR') ?? ''
const refusal =
  GLib.getenv('WAYLAND_DISPLAY') !== DISPLAY_NAME
    ? `WAYLAND_DISPLAY is not ${DISPLAY_NAME}`
    : !runtime.includes('/.nested/')
      ? `XDG_RUNTIME_DIR ${runtime} is not under .nested/`
      : !GLib.file_test(`${runtime}/${DISPLAY_NAME}`, GLib.FileTest.EXISTS)
        ? `no ${DISPLAY_NAME} socket in ${runtime}`
        : GLib.getenv('DISPLAY') !== null
          ? 'DISPLAY is set'
          : null
if (refusal) {
  console.error(`prefs-ui: refusing to run: ${refusal}`)
  System.exit(2)
}

const { default: Adw } = await import('gi://Adw?version=1')
const { default: Gtk } = await import('gi://Gtk?version=4.0')

const extDir = GLib.getenv('OMNIBAR_EXT_DIR')
const { ActionCenterPreferences } = await import(
  `file://${extDir}/actionCenter/prefs.js`
)

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

function groupsOf(widget, out = []) {
  for (let c = widget.get_first_child(); c; c = c.get_next_sibling()) {
    if (c instanceof Adw.PreferencesGroup) out.push(c)
    else groupsOf(c, out)
  }
  return out
}

Adw.init()

const builder = new Gtk.Builder()
builder.add_from_file(`${extDir}/ui/SettingsCornerstone.ui`)
const page = builder.get_object('cornerstone')
const acGroup = builder.get_object('actionCenterGroup')
const mirrorGroup = builder.get_object('mirrorGroup')
const enabledRow = builder.get_object('action_center_switch')
const bannerRow = builder.get_object('action_center_banner_click_combo')
assert(page instanceof Adw.PreferencesPage, 'cornerstone page')
assert(acGroup?.visible, 'Action Center group shown')
assert(enabledRow instanceof Adw.SwitchRow, 'action-center switch row')
assert(bannerRow instanceof Adw.ComboRow, 'banner click combo row')

// MirrorPreferences appends its per-monitor groups to the page.
page.add(new Adw.PreferencesGroup({ title: 'monitor' }))
const groups = groupsOf(page)
assert(
  groups.indexOf(acGroup) === 0 &&
    groups.indexOf(mirrorGroup) === 1 &&
    groups.length === 3,
  `group order: ${groups.map((g) => g.title)}`,
)

const source = Gio.SettingsSchemaSource.new_from_directory(
  `${extDir}/schemas`,
  Gio.SettingsSchemaSource.get_default(),
  false,
)
const schema = source.lookup('org.gnome.shell.extensions.cornerstone', false)
const settings = new Gio.Settings({
  settings_schema: schema,
  backend: Gio.memory_settings_backend_new(),
})

const nicks = schema
  .get_key('action-center-banner-click')
  .get_range()
  .deepUnpack()[1]
  .deepUnpack()
const model = bannerRow.model
assert(
  model.get_n_items() === nicks.length,
  `combo has ${model.get_n_items()} items, enum has ${nicks.length}`,
)

const prefs = new ActionCenterPreferences(builder, settings)
assert(enabledRow.active && bannerRow.sensitive, 'defaults: on, combo usable')
assert(bannerRow.selected === 0, `default selected ${bannerRow.selected}`)

settings.set_boolean('action-center', false)
assert(!enabledRow.active, 'switch follows the setting')
assert(!bannerRow.sensitive, 'combo insensitive while off')
enabledRow.active = true
assert(settings.get_boolean('action-center'), 'setting follows the switch')
assert(bannerRow.sensitive, 'combo usable again')

for (const [i, nick] of nicks.entries()) {
  settings.set_string('action-center-banner-click', nick)
  assert(bannerRow.selected === i, `${nick} selects item ${i}`)
}
for (const [i, nick] of [...nicks.entries()].reverse()) {
  bannerRow.selected = i
  const now = settings.get_string('action-center-banner-click')
  assert(now === nick, `item ${i} writes ${nick}, got ${now}`)
}

prefs.destroy()
settings.set_string('action-center-banner-click', nicks[1])
assert(bannerRow.selected === 0, 'combo still follows after destroy')

console.log('prefs-ui OK')
