import React from 'react';
type Props = React.HTMLAttributes<HTMLButtonElement> & { className?: string; children: React.ReactNode };
export default function Button({ className = '', children, ...props }: Props) {
  return (
    <button className={`bg-accent text-white px-5 py-3 rounded-xl font-semibold ${className}`} {...props}>
      {children}
    </button>
  );
}
