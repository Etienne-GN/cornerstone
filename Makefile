# Cornerstone. metadata.json is the single source of the extension identity.

metadata = $(shell python3 -c 'import json,sys; print(json.load(open("metadata.json"))[sys.argv[1]])' $(1))
UUID := $(call metadata,uuid)
SCHEMA := $(call metadata,settings-schema)
DOMAIN := $(call metadata,gettext-domain)
NAME := $(call metadata,name)
$(if $(UUID),,$(error cannot read uuid from metadata.json))
$(if $(SCHEMA),,$(error cannot read settings-schema from metadata.json))
$(if $(DOMAIN),,$(error cannot read gettext-domain from metadata.json))

MODULES = src/*.js src/stylesheet.css metadata.json COPYING README.md
SUBDIRS = mirror actionCenter
UI_MODULES = ui/*.ui
TOLOCALIZE = src/*.js src/mirror/*.js src/actionCenter/*.js
MSGSRC = $(wildcard po/*.po)

INSTALLBASE = $(HOME)/.local/share/gnome-shell/extensions

# VERSION=<n> on the command line sets the version in the packed metadata.

all: extension

clean:
	rm -f ./schemas/gschemas.compiled
	rm -rf ./_build

extension: ./schemas/gschemas.compiled $(MSGSRC:.po=.mo)

./schemas/gschemas.compiled: ./schemas/$(SCHEMA).gschema.xml
	glib-compile-schemas ./schemas/

potfile: ./po/$(DOMAIN).pot

mergepo: potfile
	for l in $(MSGSRC); do \
		msgmerge -U $$l ./po/$(DOMAIN).pot; \
	done;

./po/$(DOMAIN).pot: $(TOLOCALIZE) $(UI_MODULES)
	mkdir -p po
	xgettext -k_ -kN_ -o po/$(DOMAIN).pot --package-name "$(NAME)" \
		$(TOLOCALIZE) --from-code=UTF-8
	xgettext -o po/$(DOMAIN).pot --join-existing $(UI_MODULES)

./po/%.mo: ./po/%.po
	msgfmt -c $< -o $@

# Installs into the live session's extension directory: never use it to
# test, use tests/nested/run.sh.
install: _build
	rm -rf $(INSTALLBASE)/$(UUID)
	mkdir -p $(INSTALLBASE)/$(UUID)
	cp -r ./_build/* $(INSTALLBASE)/$(UUID)/
	rm -rf _build

zip-file: _build
	cd _build && zip -qr "../$(UUID).zip" .
	rm -rf _build

_build: all
	rm -rf ./_build
	mkdir -p _build/ui _build/schemas _build/locale
	cp $(MODULES) _build
	for d in $(SUBDIRS); do \
		mkdir -p _build/$$d; \
		cp src/$$d/*.js _build/$$d; \
	done
	cp $(UI_MODULES) _build/ui
	cp schemas/*.xml schemas/gschemas.compiled _build/schemas/
	for l in $(MSGSRC:.po=.mo) ; do \
		lf=_build/locale/`basename $$l .mo`/LC_MESSAGES; \
		mkdir -p $$lf; \
		cp $$l $$lf/$(DOMAIN).mo; \
	done
ifneq ($(VERSION),)
	sed -i 's/"version": [[:digit:]][[:digit:]]*/"version": $(VERSION)/' \
		_build/metadata.json
endif

.PHONY: all clean extension potfile mergepo install zip-file _build
