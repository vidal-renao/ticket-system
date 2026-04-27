"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const mainRef = useRef<Element | null>(null);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    mainRef.current = main;

    const handler = () => setVisible(main.scrollTop > 300);
    main.addEventListener("scroll", handler, { passive: true });
    return () => main.removeEventListener("scroll", handler);
  }, []);

  function scrollUp() {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="scroll-to-top"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          onClick={scrollUp}
          aria-label="Scroll to top"
          className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 active:scale-95 transition-[background-color,transform] duration-150"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
