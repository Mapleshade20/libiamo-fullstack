import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

// ImageMagick is an authoring tool only; all outputs are checked in.
const root = fileURLToPath(new URL("../", import.meta.url));
const master = readFileSync(join(root, "static/brand/libiamo-icon.svg"), "utf8");
const rounded = master.replace('<rect width="64" height="64"', '<rect width="64" height="64" rx="13"');
const maskable = master.replace("<g fill=", '<g transform="translate(32 32) scale(0.88) translate(-32 -32)" fill=');
const temporary = mkdtempSync(join(tmpdir(), "libiamo-icons-"));

function rasterize(source, size, output) {
	const input = join(temporary, "input.png");
	// Supersample true Bézier curves; ImageMagick's SVG renderer can flatten them visibly.
	writeFileSync(input, new Resvg(source, { fitTo: { mode: "width", value: size * 4 } }).render().asPng());
	execFileSync("magick", [input, "-resize", `${size}x${size}`, "-strip", "-define", "png:exclude-chunks=date,time", `PNG32:${output}`]);
}

try {
	writeFileSync(join(root, "src/lib/assets/favicon.svg"), rounded);
	for (const size of [192, 512]) {
		rasterize(rounded, size, join(root, `static/brand/icon-${size}.png`));
	}
	rasterize(master, 1024, join(root, "static/brand/libiamo-icon.png"));
	rasterize(master, 180, join(root, "static/apple-touch-icon.png"));
	rasterize(maskable, 512, join(root, "static/brand/icon-maskable-512.png"));
	const frames = [16, 32, 48].map((size) => {
		const path = join(temporary, `favicon-${size}.png`);
		rasterize(rounded, size, path);
		return path;
	});
	execFileSync("magick", [...frames, join(root, "static/favicon.ico")]);
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
