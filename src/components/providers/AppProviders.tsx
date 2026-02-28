"use client";

import { MantineProvider } from "@mantine/core";
import type { PropsWithChildren } from "react";
import { UserProvider } from "@/contexts/UserContext";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <MantineProvider defaultColorScheme="dark">
      <UserProvider>{children}</UserProvider>
    </MantineProvider>
  );
}
