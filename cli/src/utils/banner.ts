import pc from "picocolors";

const SOCIALAGENT_ART = ["  SocialAgent"] as const;

const TAGLINE = "AI creative agency workspace";

export function printPaperclipCliBanner(): void {
  const lines = [
    "",
    ...SOCIALAGENT_ART.map((line) => pc.cyan(line)),
    pc.blue("  ───────────────────────────────────────────────────────"),
    pc.bold(pc.white(`  ${TAGLINE}`)),
    "",
  ];

  console.log(lines.join("\n"));
}
