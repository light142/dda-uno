import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-apple-gray-800">{title}</h1>
        {subtitle && <p className="text-[15px] text-apple-gray-400 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-3">{actions}</div>}
    </div>
  );
}
