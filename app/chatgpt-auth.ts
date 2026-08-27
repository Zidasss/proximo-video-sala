import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    userId,
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    containsUnsafeRedirectCharacter(value)
  ) {
    return "/";
  }

  // Browsers normalize backslashes as path separators and some redirect
  // handlers decode a return URL more than once. Reject encoded separators in
  // the path so values such as `/%5cexample.com` can never become a
  // protocol-relative (off-site) redirect after a later decode.
  const rawPathname = value.split(/[?#]/, 1)[0];
  let decodedPathname = rawPathname;
  for (let pass = 0; pass < 8; pass += 1) {
    const decoded = safeDecodeURIComponent(decodedPathname);
    if (decoded === null) return "/";
    if (decoded === decodedPathname) break;
    decodedPathname = decoded;
    if (
      decodedPathname.startsWith("//") ||
      containsUnsafeRedirectCharacter(decodedPathname)
    ) {
      return "/";
    }
    // Eight nested encodings are not a legitimate in-product return path.
    if (pass === 7) return "/";
  }
  if (
    decodedPathname.startsWith("//") ||
    containsUnsafeRedirectCharacter(decodedPathname)
  ) {
    return "/";
  }

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (
    isReservedAuthPath(url.pathname) ||
    isReservedAuthPath(decodedPathname)
  ) {
    return "/";
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return [SIGN_IN_PATH, SIGN_OUT_PATH, CALLBACK_PATH].some(
    (reservedPath) =>
      pathname === reservedPath || pathname.startsWith(`${reservedPath}/`),
  );
}

function containsUnsafeRedirectCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return character === "\\" || codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
