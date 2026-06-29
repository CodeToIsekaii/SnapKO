"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Laptop } from "lucide-react";

export default function DownloadButtons({
  className = "",
}: {
  className?: string;
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* iOS button */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Link
          href="/download"
          className="flex items-center gap-2 bg-[#F5F5F5] text-[#1E1E1E] rounded-lg px-4 py-2.5 cursor-pointer shadow-sm hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          <div className="text-left">
            <div className="text-[10px] text-[#6F6B63] leading-none">
              Download for
            </div>
            <div className="font-semibold text-sm leading-tight">iOS</div>
          </div>
        </Link>
      </motion.div>

      {/* Android button */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Link
          href="/download"
          className="flex items-center gap-2 bg-white text-[#1E1E1E] border border-[#E0DCD5] rounded-lg px-4 py-2.5 cursor-pointer shadow-sm hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#3DDC84">
            <path d="M17.523 15.342a.96.96 0 01-.96-.96v-2.88a.96.96 0 111.92 0v2.88a.96.96 0 01-.96.96zm-11.046 0a.96.96 0 01-.96-.96v-2.88a.96.96 0 011.92 0v2.88a.96.96 0 01-.96.96zM15.49 4.18l1.02-1.855a.21.21 0 00-.366-.212L15.1 3.988a6.793 6.793 0 00-6.2 0L7.856 2.11a.21.21 0 00-.365.213L8.51 4.18A6.546 6.546 0 005 10.172h14a6.546 6.546 0 00-3.51-5.992zM9.48 7.752a.72.72 0 110-1.44.72.72 0 010 1.44zm5.04 0a.72.72 0 110-1.44.72.72 0 010 1.44zM5 18.792a1.44 1.44 0 001.44 1.44h.96v2.64a.96.96 0 101.92 0v-2.64h3.36v2.64a.96.96 0 001.92 0v-2.64h.96a1.44 1.44 0 001.44-1.44v-8.04H5v8.04z" />
          </svg>
          <div className="text-left">
            <div className="text-[10px] text-[#6F6B63] leading-none">
              Download for
            </div>
            <div className="font-semibold text-sm leading-tight">Android</div>
          </div>
        </Link>
      </motion.div>

      {/* Laptop Dropdown */}
      <div className="relative">
        <motion.button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 bg-[#5a7a1f] text-white rounded-lg px-4 py-2.5 cursor-pointer shadow-sm hover:bg-[#4d6a1a] transition-colors"
        >
          <Laptop className="w-5 h-5" />
          <div className="text-left mr-1">
            <div className="text-[10px] text-white/80 leading-none">
              Download for
            </div>
            <div className="font-semibold text-sm leading-tight">Laptop</div>
          </div>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              isDropdownOpen ? "rotate-180" : ""
            }`}
          />
        </motion.button>

        <AnimatePresence>
          {isDropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-[#E0DCD5] overflow-hidden z-20"
            >
              <Link
                href="/download"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[#FAF9F7] text-left transition-colors border-b border-[#E0DCD5]/50 group"
              >
                <svg
                  className="w-5 h-5 text-[#1E1E1E] group-hover:text-[#E07A2F]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                <div className="text-sm font-medium text-[#1E1E1E]">macOS</div>
              </Link>
              <Link
                href="/download"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[#FAF9F7] text-left transition-colors group"
              >
                <svg
                  className="w-5 h-5 text-[#1E1E1E] group-hover:text-[#0078D7]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                </svg>
                <div className="text-sm font-medium text-[#1E1E1E]">
                  Windows
                </div>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
