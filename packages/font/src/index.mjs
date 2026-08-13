import fs from "node:fs";
import zlib from "node:zlib";

import * as Caching from "@iosevka/geometry-cache";
import { encode } from "@msgpack/msgpack";
import { Ot } from "ot-builder";

import { buildFont } from "./build-font/index.mjs";
import { saveTTF } from "./font-io/index.mjs";
import { getParametersT } from "./param/index.mjs";

export default main;
async function main(argv) {
	// Set up parameters
	const paraT = await getParametersT(argv);
	const para = paraT(argv);

	// Set up cache
	const cache = argv.cache
		? await Caching.load(argv.cache.input, argv.menu.version, argv.cache.freshAgeKey)
		: null;
	// Build font
	const { font, charMap, cacheUpdated, ttfaControls } = await buildFont(para, cache);

	// Apply narrow-list post-processing: narrow only listed characters, keep others wide
	if (argv.shape.spacing === "narrow-list" && argv.narrowChars?.length) {
		await deriveNarrowList(font, argv.narrowChars);
	}

	// Save charmap
	if (argv.oCharMap) await fs.promises.writeFile(argv.oCharMap, zlib.gzipSync(encode(charMap)));
	// Save ttfaControls
	if (argv.oTtfaControls) await fs.promises.writeFile(argv.oTtfaControls, ttfaControls);
	// Save TTF
	if (argv.o) await saveTTF(argv.o, font);
	// Save cache
	if (argv.cache && cache?.isUpdated()) {
		await Caching.save(argv.cache.output, argv.menu.version, cache, true);
	}

	return { cacheUpdated };
}

async function deriveNarrowList(font, narrowChars) {
	if (narrowChars.length === 0) return;
	if (!font.gsub) return;
	// Build NWID mapping from GSUB: wide glyph ID → narrow glyph ID
	const nwidMap = new Map();
	for (const feature of font.gsub.features) {
		if (feature.tag !== "NWID") continue;
		for (const lookup of feature.lookups) {
			if (!(lookup instanceof Ot.Gsub.Single)) continue;
			for (const [from, to] of lookup.mapping) {
				nwidMap.set(from, to);
			}
		}
	}
	// Remap only the specified characters from wide (WWID) to narrow (NWID)
	for (const ch of narrowChars) {
		const wideGid = font.cmap.unicode.get(ch);
		if (wideGid == null) continue;
		const narrowGid = nwidMap.get(wideGid);
		if (narrowGid != null) font.cmap.unicode.set(ch, narrowGid);
	}
}
