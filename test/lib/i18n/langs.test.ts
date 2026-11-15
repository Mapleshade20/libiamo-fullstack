import { assert, test } from "vitest";
import { appLangOf, dirOf, htmlLang } from "#lib/i18n/langs.ts";

test("the browser's first language the interface has", () => {
	assert.equal(appLangOf(["fr-CA", "en"]), "fr");
	assert.equal(appLangOf(["xx", "pt-BR"]), "pt");
	assert.equal(appLangOf([]), "en");
});

test("Chinese is Simplified only: Traditional falls through to the next language", () => {
	assert.equal(appLangOf(["zh-CN"]), "zh-CN");
	assert.equal(appLangOf(["zh"]), "zh-CN");
	assert.equal(appLangOf(["zh-Hans-SG"]), "zh-CN");
	assert.equal(appLangOf(["zh-TW", "ja"]), "ja");
	assert.equal(appLangOf(["zh-Hant"]), "en");
});

test("<html> attributes", () => {
	assert.equal(htmlLang("zh-CN"), "zh-Hans");
	assert.equal(dirOf("fa"), "rtl");
	assert.equal(dirOf("en"), "ltr");
});
