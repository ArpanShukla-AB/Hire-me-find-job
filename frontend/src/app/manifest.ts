import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JobPilot AI",
    short_name: "JobPilot",
    description: "A focused workspace for your job search.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f9fc",
    theme_color: "#6655dc",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
