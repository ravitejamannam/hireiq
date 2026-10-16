import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  join(process.cwd(), "components/dashboard/Sidebar.tsx"),
  "utf8",
);
const adminLayout = readFileSync(
  join(process.cwd(), "app/dashboard/layout.tsx"),
  "utf8",
);

describe("admin sidebar applications link", () => {
  it("points admins at the existing applications page", () => {
    expect(sidebar).toContain('label: "Applications"');
    expect(sidebar).toContain('href: "/dashboard/applications"');
    expect(sidebar).not.toContain(">Settings<");
    expect(adminLayout).toContain("requireAdmin()");
  });
});
