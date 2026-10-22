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

const extDir = GLib.getenv('CORNERSTONE_EXT_DIR')
const load = (name) => import(`file://${extDir}/prefs/${name}.js`)
const { ButtonPage, CLOCK_PRESETS } = await load('buttonPage')
const { ActionCenterPage } = await load('actionCenterPage')
const { TrayPage } = await load('trayPage')
const { AboutPage } = await load('aboutPage')
const { readCatalog } = await load('catalog')

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

function sleep(ms) {
  return new Promise((resolve) =>
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      resolve()
      return GLib.SOURCE_REMOVE
    }),
  )
}

function rowsOf(widget, type, out = []) {
  for (let c = widget.get_first_child(); c; c = c.get_next_sibling()) {
    if (c instanceof type) out.push(c)
    rowsOf(c, type, out)
  }
  return out
}

Adw.init()

// In-memory settings: the shell writes its keyfile too, and two writers
// would undo each other's changes. The catalog the shell published comes
// in through the environment.
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
settings.set_string(
  'mirror-indicator-catalog',
  GLib.getenv('CORNERSTONE_CATALOG') ?? '{}',
)
const KEYS = schema.list_keys().filter((k) => k !== 'mirror-indicator-catalog')
const resetAll = () => KEYS.forEach((k) => settings.reset(k))

async function checkButtonPage() {
  const page = new ButtonPage(settings)
  const catalog = readCatalog(settings)

  page._formatRow.selected = 1
  assert(
    settings.get_string('clock-format') === CLOCK_PRESETS[1],
    'a preset writes its format',
  )
  assert(!page._customRow.visible, 'custom field hidden for a preset')
  page._formatRow.selected = CLOCK_PRESETS.length
  assert(page._customRow.visible, 'custom field shown for Custom')
  page._customRow.text = '%H:%M\\n%a'
  page._customRow.emit('apply')
  assert(
    settings.get_string('clock-format') === '%H:%M\n%a',
    `custom format written: ${JSON.stringify(settings.get_string('clock-format'))}`,
  )
  assert(page._preview.clockText.includes('\n'), 'preview shows two lines')

  const elementRows = page._elementRows._rows
  assert(elementRows.length === 2, 'two element rows')
  const clockRow = elementRows.find((r) => r.title === 'Clock')
  clockRow.active = false
  assert(
    JSON.stringify(settings.get_strv('button-elements')) === '["indicators"]',
    `clock removed: ${settings.get_strv('button-elements')}`,
  )
  const last = page._elementRows._rows.find((r) => r.active)
  assert(!last.sensitive, 'the last shown element cannot be turned off')

  if (catalog.indicators.length) {
    const rows = page._indicatorRows._rows
    assert(
      rows.length === catalog.indicators.length,
      `${rows.length} indicator rows for ${catalog.indicators.length}`,
    )
    rows[0].active = false
    assert(
      settings.get_strv('button-hidden-indicators').length === 1,
      'an indicator switch hides it',
    )
  }
  resetAll()

  if (catalog.monitors.length > 1) {
    assert(page._monitorGroup.visible, 'monitor choice shown on 2 monitors')
    assert(!page.ownRow.visible, 'no own-settings switch for every monitor')
    const key = catalog.monitors[1].key
    page.monitorRow.selected = 2
    assert(page.monitor === key, `second monitor chosen: ${page.monitor}`)
    assert(page.ownRow.visible && !page.ownRow.active, 'own settings off')
    assert(!page._clockGroup.sensitive, 'read-only until own settings')

    page.ownRow.active = true
    assert(page._clockGroup.sensitive, 'editable with own settings')
    page._formatRow.selected = 1
    const overrides = JSON.parse(settings.get_string('button-monitor-overrides'))
    assert(
      overrides[key]?.['clock-format'] === CLOCK_PRESETS[1],
      `override written: ${JSON.stringify(overrides)}`,
    )
    assert(settings.get_string('clock-format') === '', 'global format kept')
    assert(
      page.monitorRow.model.get_string(2).includes('own settings'),
      'monitor marked as having its own settings',
    )

    page.monitorRow.selected = 0
    assert(page._formatRow.selected === 0, 'every monitor shows its own format')
    page.monitorRow.selected = 2
    assert(page._formatRow.selected === 1, 'the monitor shows its override')
    page.ownRow.active = false
    assert(
      settings.get_string('button-monitor-overrides') === '{}',
      'override removed',
    )
    resetAll()
  }
  page.destroy()
}

async function checkActionCenterPage() {
  const page = new ActionCenterPage(settings)
  const nicks = schema
    .get_key('action-center-banner-click')
    .get_range()
    .deepUnpack()[1]
    .deepUnpack()
  assert(
    page.bannerRow.model.get_n_items() === nicks.length,
    'banner combo follows the enum',
  )
  for (const [i, nick] of nicks.entries()) {
    settings.set_string('action-center-banner-click', nick)
    assert(page.bannerRow.selected === i, `${nick} selects item ${i}`)
  }
  page.bannerRow.selected = 0
  assert(
    settings.get_string('action-center-banner-click') === nicks[0],
    'combo writes the enum',
  )
  settings.set_boolean('action-center', false)
  assert(!page.bannerRow.sensitive, 'banner combo off with the Action Center')

  assert(page.autoRow.active && !page.widthRow.sensitive, 'width auto')
  page.autoRow.active = false
  assert(settings.get_int('action-center-width') >= 400, 'fixed width set')
  page.widthRow.value = 900
  assert(settings.get_int('action-center-width') === 900, 'width follows')

  page.sectionRows.weather.active = false
  assert(
    settings.get_strv('action-center-hidden-sections').includes('weather'),
    'weather hidden',
  )
  resetAll()
  assert(page.sectionRows.weather.active, 'rows follow a reset')
  page.destroy()
}

async function checkTrayPage() {
  const page = new TrayPage(settings)
  const { tray } = readCatalog(settings)
  const items = page.items()
  assert(items.length === tray.length, 'one item per tray icon')
  if (items.length >= 2) {
    const [first, second] = items.map((i) => i.role)
    page._write([items[1], items[0], ...items.slice(2)])
    const saved = JSON.parse(settings.get_string('tray-layout')).main
    assert(
      saved[0].role === second && saved[1].role === first,
      'reorder saved for the main monitor',
    )
  }
  resetAll()
  page.destroy()
}

async function showWindow() {
  const window = new Adw.PreferencesWindow({ default_width: 720, default_height: 1000 })
  const pages = [
    new ButtonPage(settings),
    new ActionCenterPage(settings),
    new TrayPage(settings),
    new AboutPage({ name: 'Cornerstone', version: 1, url: 'https://github.com/Etienne-GN/cornerstone' }),
  ]
  for (const { page } of pages) window.add(page)
  window.present()
  await sleep(1500)
  for (const [name, { page }] of [
    ['button', pages[0]],
    ['action-center', pages[1]],
    ['tray', pages[2]],
  ]) {
    window.visible_page = page
    await sleep(800)
    printerr(`SHOW ${name}`)
    await sleep(1200)
  }
  for (const page of pages) page.destroy()
  window.destroy()
}

async function main() {
  resetAll()
  printerr('prefs-ui: button page')
  await checkButtonPage()
  printerr('prefs-ui: action center page')
  await checkActionCenterPage()
  printerr('prefs-ui: tray page')
  await checkTrayPage()
  printerr('prefs-ui: window')
  await showWindow()
  printerr('prefs-ui OK')
}

// runAsync, unlike run, lets awaited promises resume inside the loop.
const loop = new GLib.MainLoop(null, false)
let failed = null
main()
  .catch((e) => {
    failed = e
  })
  .finally(() => loop.quit())
await loop.runAsync()
if (failed) {
  printerr(`prefs-ui: ${failed}\n${failed.stack}`)
  System.exit(1)
}
