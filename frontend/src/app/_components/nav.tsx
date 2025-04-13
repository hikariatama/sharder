'use client';

import { motion } from 'framer-motion';
import { CloudUpload, GalleryVerticalEnd, Home } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

function Button(path: string, icon: ReactNode, caption: string, onClick?: () => void) {
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <motion.div
      key={path}
      whileHover={{ translateY: -2 }}
      whileTap={{ translateY: 2 }}
      transition={{ type: 'spring', stiffness: 1000, damping: 30 }}
      className="mx-2 my-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link
        href={path}
        onClick={handleClick}
        className={twMerge(
          pathname === path ? 'text-white' : 'text-[#848488]',
        )}
      >
        {icon}
        {isHovered && (
          <motion.span>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1"
            >
              {caption}
            </motion.div>
          </motion.span>)}
      </Link>
    </motion.div>
  );
}

export default function Navbar({ handleUpload }: { handleUpload: () => void }) {
  return (
    <div
      className="flex items-center gap-1 fixed bottom-2 left-0 right-0 m-auto px-1 py-1 border-white/30 border-1 backdrop-blur-xl w-fit rounded-full z-50"
    >
      {Button('/', <Home className="w-5 h-5" />, "Home")}
      {Button('/explorer', <GalleryVerticalEnd className="w-5 h-5" />, "Explorer")}
      {Button('/upload', <CloudUpload className="w-5 h-5" />, "Upload", handleUpload)}
    </div>
  );
};
