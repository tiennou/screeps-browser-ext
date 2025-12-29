// ==UserScript==
// @name         Console Shard Coloring
// @namespace    https://screeps.com/
// @version      1.1
// @description  This tweaks the background colors of console logs from each shard to improve clarity
// @author       Traxus
// @match        https://screeps.com/a/*
// @match        https://screeps.com/ptr/*
// @match        http://*.localhost:*/(*)/#!/*
// @run-at       document-ready
// @icon         https://www.google.com/s2/favicons?sz=64&domain=screeps.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    log("TamperMonkey - Loaded Console Shard Coloring");

    function log(...args) {
        console.warn(...args);
    }

    /**
     * Takes a string of the form #rgb or #rrggbb and splits it into its components
     */
    function convertHexToRGB(h) {
        let r = 0, g = 0, b = 0;

        if (h.length == 4) {
            r = "0x" + h[1] + h[1];
            g = "0x" + h[2] + h[2];
            b = "0x" + h[3] + h[3];
        } else if (h.length == 7) {
            r = "0x" + h[1] + h[2];
            g = "0x" + h[3] + h[4];
            b = "0x" + h[5] + h[6];
        }
        return [+r, +g, +b];
    }

    function convertRGBToHex(r, g, b) {
        return "#"
            + (+r).toString(16).padStart(2, "0")
            + (+g).toString(16).padStart(2, "0")
            + (+b).toString(16).padStart(2, "0");
    }

    function convertRGBToHSL(r,g,b) {
        // Make r, g, and b fractions of 1
        r /= 255;
        g /= 255;
        b /= 255;

        // Find greatest and smallest channel values
        let cmin = Math.min(r,g,b),
            cmax = Math.max(r,g,b),
            delta = cmax - cmin,
            h = 0,
            s = 0,
            l = 0;

        // Calculate hue
        if (delta == 0) {
            // No difference
            h = 0;
        } else if (cmax == r) {
            // Red is max
            h = ((g - b) / delta) % 6;
        } else if (cmax == g) {
            // Green is max
            h = (b - r) / delta + 2;
        } else {
            // Blue is max
            h = (r - g) / delta + 4;
        }

        h = Math.round(h * 60);

        // Make negative hues positive behind 360°
        if (h < 0) {
            h += 360;
        }
        // Calculate lightness
        l = (cmax + cmin) / 2;

        // Calculate saturation
        s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

        // Multiply l and s by 100
        s = +(s * 100).toFixed(1);
        l = +(l * 100).toFixed(1);

        return [h, s, l];
    }

    function convertHSLToRGB(h,s,l) {
        // Must be fractions of 1
        s /= 100;
        l /= 100;

        // Must be within [0..360[
        h = Math.abs(h % 360);

        let c = (1 - Math.abs(2 * l - 1)) * s,
            x = c * (1 - Math.abs((h / 60) % 2 - 1)),
            m = l - c / 2,
            r = 0,
            g = 0,
            b = 0;

        if (0 <= h && h < 60) {
            r = c; g = x; b = 0;
        } else if (60 <= h && h < 120) {
            r = x; g = c; b = 0;
        } else if (120 <= h && h < 180) {
            r = 0; g = c; b = x;
        } else if (180 <= h && h < 240) {
            r = 0; g = x; b = c;
        } else if (240 <= h && h < 300) {
            r = x; g = 0; b = c;
        } else if (300 <= h && h < 360) {
            r = c; g = 0; b = x;
        }
        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);

        return [r, g, b];
    }

    async function digestMessage(message) {
        const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8); // hash the message
        const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
        const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""); // convert bytes to hex string
        return hashHex;
    }

    /**
     * Returns a hash code for a string.
     * (Compatible to Java's String.hashCode())
     *
     * The hash code for a string object is computed as
     *     s[0]*31^(n-1) + s[1]*31^(n-2) + ... + s[n-1]
     * using number arithmetic, where s[i] is the i th character
     * of the given string, n is the length of the string,
     * and ^ indicates exponentiation.
     * (The hash value of the empty string is zero.)
     *
     * @param {string} s a string
     * @return {number} a hash code value for the given string.
     */
    function hashCode(s) {
        let h = 0, l = s.length, i = 0;
        if (l > 0) {
            while (i < l) {
                h = (h << 5) - h + s.charCodeAt(i++) | 0;
            }
        }
        return h;
    }

    function getCurrentShard() {
        const currentShardName = window.location.hash.match(/^#!\/room\/([^\/]*)/)?.[1];
        if (!currentShardName) {
            throw new Error("Failed to get shard name");
        }
        return currentShardName;
    }

    /**
     * Get a color from a shard name
     */
    async function colorForShard(shardName) {
        // Default background color
        const baseColor = "#2b2b2b";

        // Get an unique random hash from the shard name
        const digest = await digestMessage(shardName);
        const hash = hashCode(digest);

        // Rotate the base color around the color space
        let rgb = convertHexToRGB(baseColor);
        let hsl = convertRGBToHSL(...rgb);
        hsl[0] += hash;
        hsl[1] = 7;
        rgb = convertHSLToRGB(...hsl);
        const color = convertRGBToHex(...rgb);

        return color;//colors[shardName] ?? baseColor;
    }

    async function testColors() {
        const shards = ["shard0", "shard1", "shard2", "shard3", "random"];
        for (const shard of shards) {
            const color = await colorForShard(shard);
            log("final color for shard:", shard, "color:", color);
        }
    }

    //setTimeout(testColors, 0);

    async function loop() {

        const messages = document.getElementsByClassName("console-message");
        for (const msg of messages) {
            const shardElm = msg.getElementsByClassName("shard")[0];
            const shardName = shardElm?.innerText.match(/^\[(.*)\]$/)?.[1];
            if (shardName){
                const bgColor = await colorForShard(shardName);
                //log("current:", getCurrentShard(), "msg:", shardName, "color:", bgColor);
                msg.style.backgroundColor = bgColor
            }
        }
    }

    setInterval(loop, 200);
})();
