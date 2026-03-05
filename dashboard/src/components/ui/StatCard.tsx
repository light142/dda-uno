import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}

const colorMap: Record<string, string> = {
  blue: '#0071e3',
  green: '#34c759',
  red: '#ff3b30',
  orange: '#ff9500',
  yellow: '#ffcc00',
  purple: '#af52de',
  indigo: '#5856d6',
};

export default function StatCard({ label, value, subtext, color = 'blue' }: StatCardProps) {
  const dotColor = colorMap[color] || colorMap.blue;

  return (
    <div className="bg-white rounded-2xl shadow-apple p-5 border border-apple-gray-200/60">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
        <p className="text-[13px] font-medium text-apple-gray-400">{label}</p>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-apple-gray-800">{value}</p>
      {subtext && <p className="text-[12px] text-apple-gray-400 mt-1">{subtext}</p>}
    </div>
  );
}
