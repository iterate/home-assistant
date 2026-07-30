import { describe, expect, test } from "vitest";
import { parseItxPath, parseOptions, parseStreamPath } from "./config.js";

describe("Home Assistant app configuration", () => {
  test("keeps the ITX mount and stream path independent", () => {
    expect(
      parseOptions({
        iterate_url: "https://os.iterate.com/",
        project_slug: "iterate",
        project_secret: "secret",
        itx_path: "ITX.myHa",
        stream_path: "/home-assistant/ceil-sense/",
      }),
    ).toEqual({
      iterateUrl: "https://os.iterate.com",
      itxPath: ["myHa"],
      projectSecret: "secret",
      projectSlug: "iterate",
      streamPath: "/home-assistant/ceil-sense",
    });
  });

  test("accepts a nested ITX path and adds the stream's leading slash", () => {
    expect(parseItxPath("home.assistant")).toEqual(["home", "assistant"]);
    expect(parseStreamPath("home-assistant/main")).toBe("/home-assistant/main");
  });

  test.each(["itx.then", "itx.__proto__", "bad-path", "itx."])(
    "rejects unsafe ITX path %s",
    (path) => {
      expect(() => parseItxPath(path)).toThrow();
    },
  );

  test.each(["/", "/home-assistant//main", "/home-assistant/../main"])(
    "rejects ambiguous stream path %s",
    (path) => {
      expect(() => parseStreamPath(path)).toThrow();
    },
  );

  test("rejects blank secrets after trimming", () => {
    expect(() =>
      parseOptions({
        iterate_url: "https://os.iterate.com",
        project_slug: "iterate",
        project_secret: " ",
        itx_path: "myHa",
        stream_path: "/home-assistant/main",
      }),
    ).toThrow("project_secret must not be blank");
  });
});
