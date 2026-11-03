"use client";

import * as React from "react";
import NextLink from "next/link";
import { useCallback } from "react";
import {
  useParams as useNextParams,
  usePathname,
  useRouter,
  useSearchParams as useNextSearchParams,
} from "next/navigation";
import { applyCompanyPrefix, caseHref, extractCompanyPrefixFromPath, normalizeCompanyPrefix } from "./company-routes";
import { useOptionalCompany } from "../context/CompanyContext";

export type NavigateOptions = {
  replace?: boolean;
  scroll?: boolean;
  preventScrollReset?: boolean;
  state?: unknown;
};

type NavigationRenderState = { isActive: boolean; isPending: false };
type LinkTarget = string | { pathname?: string; search?: string; hash?: string; state?: unknown };
export type To = LinkTarget;
export type NavigateFunction = (to: LinkTarget | number, options?: NavigateOptions) => void;
type LinkProps = Omit<React.ComponentProps<typeof NextLink>, "href" | "className" | "children"> & {
  to: LinkTarget;
  children?: React.ReactNode | ((state: NavigationRenderState) => React.ReactNode);
  className?: string | ((state: NavigationRenderState) => string);
  reloadDocument?: boolean;
  preventScrollReset?: boolean;
  state?: unknown;
  relative?: string;
  disableIssueQuicklook?: boolean;
  issuePrefetch?: unknown;
  issueQuicklookSide?: "top" | "right" | "bottom" | "left";
  issueQuicklookAlign?: "start" | "center" | "end";
};

function resolveLinkTarget(to: LinkTarget, companyPrefix: string | null): string {
  if (typeof to === "string") return applyCompanyPrefix(to, companyPrefix);
  const pathname = to.pathname ?? "";
  const resolvedPath = pathname.startsWith("/") ? applyCompanyPrefix(pathname, companyPrefix) : pathname;
  return `${resolvedPath}${to.search ?? ""}${to.hash ?? ""}`;
}

export function useActiveCompanyPrefix(): string | null {
  const params = useNextParams() as Record<string, string | string[] | undefined> | null;
  const pathname = usePathname() ?? "/";
  const selectedCompany = useOptionalCompany()?.selectedCompany;
  const companyParam = params?.companyPrefix;
  if (typeof companyParam === "string") return normalizeCompanyPrefix(companyParam);
  const pathPrefix = extractCompanyPrefixFromPath(pathname);
  if (pathPrefix) return pathPrefix;
  return selectedCompany ? normalizeCompanyPrefix(selectedCompany.issuePrefix) : null;
}

export function useCaseHref(): (...segments: string[]) => string {
  const prefix = useActiveCompanyPrefix();
  return React.useCallback((...segments: string[]) => caseHref(prefix, ...segments), [prefix]);
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function NextRouterLink(
  {
    to,
    reloadDocument,
    preventScrollReset,
    state: _state,
    relative: _relative,
    disableIssueQuicklook: _disableIssueQuicklook,
    issuePrefetch: _issuePrefetch,
    issueQuicklookSide: _issueQuicklookSide,
    issueQuicklookAlign: _issueQuicklookAlign,
    className,
    children,
    onClick,
    replace,
    ...props
  },
  ref,
) {
  const companyPrefix = useActiveCompanyPrefix();
  const href = resolveLinkTarget(to, companyPrefix);
  const resolvedClassName = typeof className === "function"
    ? className({ isActive: false, isPending: false })
    : className;
  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (event) => {
    onClick?.(event);
    if (event.defaultPrevented || reloadDocument || !href.startsWith("/")) return;
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      publishNavigationType(replace ? "REPLACE" : "PUSH");
    }
  };
  const resolvedChildren = typeof children === "function"
    ? children({ isActive: false, isPending: false })
    : children;
  if (reloadDocument) return <a ref={ref} href={href} className={resolvedClassName} onClick={handleClick} {...props}>{resolvedChildren}</a>;
  return <NextLink ref={ref} href={href} replace={replace} scroll={!preventScrollReset} className={resolvedClassName} onClick={handleClick} {...props}>{resolvedChildren}</NextLink>;
});

type NavigationType = "POP" | "PUSH" | "REPLACE";
let currentNavigationType: NavigationType = "POP";
const navigationTypeListeners = new Set<() => void>();

function publishNavigationType(type: NavigationType) {
  currentNavigationType = type;
  navigationTypeListeners.forEach((listener) => listener());
}

function subscribeNavigationType(listener: () => void) {
  navigationTypeListeners.add(listener);
  const onPopState = () => publishNavigationType("POP");
  window.addEventListener("popstate", onPopState);
  return () => {
    navigationTypeListeners.delete(listener);
    window.removeEventListener("popstate", onPopState);
  };
}

export function useNavigationType(): NavigationType {
  return React.useSyncExternalStore(
    subscribeNavigationType,
    () => currentNavigationType,
    () => "POP",
  );
}

export function useLocation() {
  const pathname = usePathname() ?? "/";
  const searchParams = useNextSearchParams()!;
  const search = searchParams.size ? `?${searchParams.toString()}` : "";
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  const key = `${pathname}${search}`;
  const state: unknown = typeof window === "undefined" ? null : window.history.state?.usr ?? null;
  return React.useMemo(() => ({ pathname, search, hash, state, key }), [pathname, search, hash, key, state]);
}

export function useBeforeUnload(
  callback: (event: BeforeUnloadEvent) => void,
  options?: { capture?: boolean },
) {
  React.useEffect(() => {
    const capture = options?.capture ?? false;
    window.addEventListener("beforeunload", callback, capture);
    return () => window.removeEventListener("beforeunload", callback, capture);
  }, [callback, options?.capture]);
}

export function useNavigate(): NavigateFunction {
  const router = useRouter();
  const companyPrefix = useActiveCompanyPrefix();

  return useCallback(
    (to: LinkTarget | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        publishNavigationType("POP");
        window.history.go(to);
        return;
      }

      const href = resolveLinkTarget(to, companyPrefix);
      const navigationOptions = options?.scroll === undefined ? undefined : { scroll: options.scroll };
      if (options?.replace) {
        publishNavigationType("REPLACE");
        router.replace(href, navigationOptions);
      } else {
        publishNavigationType("PUSH");
        router.push(href, navigationOptions);
      }
    },
    [router, companyPrefix],
  );
}

export type SearchParamsInit =
  | string
  | URLSearchParams
  | Record<string, string | string[]>
  | Array<[string, string]>;
export type SetSearchParams = (
  nextInit: SearchParamsInit | ((current: URLSearchParams) => SearchParamsInit),
  options?: NavigateOptions,
) => void;

function serializeSearchParams(init: SearchParamsInit): string {
  if (typeof init === "string") return new URLSearchParams(init.replace(/^\?/, "")).toString();
  if (init instanceof URLSearchParams) return init.toString();
  if (Array.isArray(init)) return new URLSearchParams(init).toString();

  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(init)) {
    for (const item of Array.isArray(value) ? value : [value]) entries.push([key, item]);
  }
  return new URLSearchParams(entries).toString();
}

export function useSearchParams(): readonly [URLSearchParams, SetSearchParams] {
  const searchParams = useNextSearchParams()!;
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const setSearchParams = useCallback<SetSearchParams>(
    (nextInit, options) => {
      const current = new URLSearchParams(searchParams.toString());
      const nextInitValue = typeof nextInit === "function" ? nextInit(current) : nextInit;
      const search = serializeSearchParams(nextInitValue);
      const hash = typeof window === "undefined" ? "" : window.location.hash;
      const href = `${pathname}${search ? `?${search}` : ""}${hash}`;
      const navigationOptions = {
        ...(options?.scroll === undefined ? {} : { scroll: options.scroll }),
        ...(options?.preventScrollReset === undefined ? {} : { scroll: !options.preventScrollReset }),
      };
      if (options?.replace) {
        publishNavigationType("REPLACE");
        router.replace(href, navigationOptions);
      } else {
        publishNavigationType("PUSH");
        router.push(href, navigationOptions);
      }
    },
    [pathname, router, searchParams],
  );
  return [searchParams, setSearchParams];
}

export function useParams<
  T extends Record<string, string | string[] | undefined> = Record<string, string>,
>() {
  return (useNextParams() ?? {}) as T;
}

type NavLinkProps = LinkProps & {
  end?: boolean;
  caseSensitive?: boolean;
};

export function NavLink({ to, end = false, caseSensitive = false, className, children, ...props }: NavLinkProps) {
  const companyPrefix = useActiveCompanyPrefix();
  const pathname = usePathname() ?? "/";
  const hrefPath = new URL(resolveLinkTarget(to, companyPrefix), "http://next.local").pathname;
  const currentPath = caseSensitive ? pathname : pathname.toLowerCase();
  const targetPath = caseSensitive ? hrefPath : hrefPath.toLowerCase();
  const isActive = currentPath === targetPath || (!end && currentPath.startsWith(`${targetPath.replace(/\/$/, "")}/`));
  const resolvedClassName = typeof className === "function"
    ? className({ isActive, isPending: false })
    : className;
  const resolvedChildren = typeof children === "function"
    ? children({ isActive, isPending: false })
    : children;
  return <Link to={to} className={resolvedClassName} aria-current={isActive ? "page" : undefined} {...props}>{resolvedChildren}</Link>;
}

export function Navigate({ to, replace = false }: { to: LinkTarget; replace?: boolean }) {
  const navigate = useNavigate();
  React.useEffect(() => navigate(to, { replace }), [navigate, replace, to]);
  return null;
}

export function Outlet() {
  return null;
}
