const authApiUrl = (import.meta.env.PUBLIC_GITHUB_AUTH_API_URL ?? "").replace(
  /\/+$/,
  ""
);

export const adminConfig = Object.freeze({
  owner: "JinYong-Jeong",
  repository: "JinYong-Jeong.github.io",
  branch: "main",
  githubClientId: import.meta.env.PUBLIC_GITHUB_CLIENT_ID ?? "",
  authApiUrl,
  redirectPath: "/admin/"
});

export const isAdminConfigured = Boolean(
  adminConfig.githubClientId && adminConfig.authApiUrl
);
