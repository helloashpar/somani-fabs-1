import React from "react";

// Customer photo, or a default silhouette when there is none (customer-entry
// sessions). Size and rounding come from `className`.
export default function Avatar({ src, className = "" }) {
  if (src) return <img src={src} alt="" loading="lazy" className={`object-cover border ${className}`} />;
  return (
    <div data-testid="default-avatar" className={`overflow-hidden bg-[#C9D0E3] ${className}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax slice" className="w-full h-full" aria-hidden="true">
        {/* head */}
        <path fill="#fff" d="M50 18c-10.5 0-17.5 7.6-17.5 18.5 0 3.2.4 6 1.2 8.6-1.5.4-2.1 2-1.7 3.9.5 2.4 1.8 4.2 3.3 4.5 1.9 6.7 6.2 11.5 14.7 11.5s12.8-4.8 14.7-11.5c1.5-.3 2.8-2.1 3.3-4.5.4-1.9-.2-3.5-1.7-3.9.8-2.6 1.2-5.4 1.2-8.6C67.5 25.6 60.5 18 50 18Z" />
        {/* neck and shoulders */}
        <path fill="#fff" d="M41 62h18v7.5c7.5 3.4 21 5.8 25.5 11.5 2.6 3.3 3.5 11 3.5 19H12c0-8 .9-15.7 3.5-19C20 75.3 33.5 72.9 41 69.5V62Z" />
      </svg>
    </div>
  );
}
