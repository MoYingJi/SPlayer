import { app } from "electron";
import path from "path";
import fs from "node:fs";

export function resolveResourcesPath(...paths: string[]) {
  const customResourcesPath = process.env.SPLAYER_RESOURCES_PATH;
  if (customResourcesPath) {
    return path.join(customResourcesPath, ...paths);
  }

  const defaultPath = path.join(process.resourcesPath, ...paths);
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  const fallbackPath = path.join(path.dirname(app.getAppPath()), ...paths);
  if (fs.existsSync(fallbackPath)) {
    return fallbackPath;
  }

  return null;
}
