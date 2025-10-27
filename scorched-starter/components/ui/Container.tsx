import React from 'react';
type Props = { className?: string; children: React.ReactNode };
export default function Container({ className = '', children }: Props) {
  return <div className={`container-px max-w-7xl mx-auto ${className}`}>{children}</div>;
}
