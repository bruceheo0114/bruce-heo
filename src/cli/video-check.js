import { formatReport, runChecks } from "../lib/video/setup-check.js";

const results = await runChecks();
console.log(formatReport(results));
if (results.some((result) => result.level === "fail")) process.exit(1);
