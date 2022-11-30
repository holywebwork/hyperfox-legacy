/**
 * Creates additional HTML files for react-router-dom to work correctly.
 */
import { copyFile, mkdir } from "node:fs/promises";

const buildURL = new URL("./build/", import.meta.url);
const indexURL = new URL("index.html", buildURL);

/**
 * Paths relative to buildURL
 */
const files = [
  "system/home.html",
  "about/newtab.html",
  "about/preferences.html",
];

for (const file of files) {
  const output = new URL(file, buildURL);

  try {
    await mkdir(new URL(".", output), { recursive: true });
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
  }

  try {
    await copyFile(indexURL, output);
    console.log(output.href);
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
  }
}
