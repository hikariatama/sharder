'use client';

import { motion } from 'framer-motion';
import { CloudUpload, Fingerprint, GalleryVerticalEnd, Home, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { twMerge } from 'tailwind-merge';
import { useAuthContext } from '../context/AuthContext';

function Button(
  pathname: string,
  path: string,
  icon: React.ReactNode,
  caption: string,
  onClick?: () => void
) {
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
      className="relative mx-2 my-1 group"
    >
      <Link
        href={path}
        onClick={handleClick}
        className={twMerge(
          pathname === path ? 'text-white' : 'text-[#848488]'
        )}
      >
        {icon}
        <div
          className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 group-hover:opacity-100 opacity-0 transition-opacity duration-200 ease-in-out"
        >
          {caption}
        </div>
      </Link>
    </motion.div>
  );
}


export default function Navbar({ handleUpload }: { handleUpload: () => void }) {
  const { id, isLoading } = useAuthContext();
  const pathname = usePathname();

  return (
    <div
      className="flex items-center gap-1 fixed bottom-2 left-0 right-0 m-auto px-1 py-1 border-white/30 border-1 backdrop-blur-xl w-fit rounded-full z-50"
    >
      {Button(pathname, '/', <Home className="w-5 h-5" />, "Home")}
      {isLoading ? (
        <>
          <LoaderCircle className="mx-2 my-1 w-5 h-5 animate-spin text-white" />
          <LoaderCircle className="mx-2 my-1 w-5 h-5 animate-spin text-white" />
        </>
      ) : id ? (
        <>
          {Button(pathname, '/explorer', <GalleryVerticalEnd className="w-5 h-5" />, "Explorer")}
          {Button(pathname, '#', <CloudUpload className="w-5 h-5" />, "Upload", handleUpload)}
        </>
      ) : (
        <>
          {Button(pathname, '/access', <Fingerprint className="w-5 h-5" />, "Auth")}
        </>
      )}
    </div>
  );
};
