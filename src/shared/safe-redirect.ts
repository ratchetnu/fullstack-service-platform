/**
 * After sign-in we send the user back to the page they asked for. That target
 * comes from the URL, so it must be a path on this site — otherwise a crafted
 * link could bounce a freshly signed-in user to another website (an "open redirect").
 */
export function safeRedirectPath(target: string | null | undefined, fallback = "/dashboard"): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return fallback;
  }
  try {
    const url = new URL(target, "http://placeholder.invalid");
    if (url.origin !== "http://placeholder.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
