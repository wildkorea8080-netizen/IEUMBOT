import type { ReactNode } from "react";

import { DataTable } from "./data-table";

export function AdminTable(props: { children: ReactNode }) {
  return <DataTable>{props.children}</DataTable>;
}
