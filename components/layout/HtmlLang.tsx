"use client";

import { useEffect } from "react";

interface HtmlLangProps {
  locale: string;
}

/**
 * Sets document.documentElement.lang on mount and on locale change.
 * Required because the root layout provides a static default lang="de"
 * while actual locale is determined at the [locale] segment level.
 */
export function HtmlLang({ locale }: HtmlLangProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
