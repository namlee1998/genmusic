import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

const navItems = [
  {
    title: 'Quản lý tài liệu',
    path: '/',
    icon: 'description',
  },
  {
    title: 'Phân tích luồng',
    path: '/flow-analysis',
    icon: 'account_tree',
  },
  {
    title: 'Kịch bản thử nghiệm',
    path: '/test-scenarios',
    icon: 'biotech',
  },
  {
    title: 'Xuất kịch bản YAML',
    path: '/yaml-export',
    icon: 'terminal',
  },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="h-screen w-64 fixed left-0 top-0 overflow-y-auto bg-surface-container-low border-r border-outline-variant/25 flex flex-col z-50">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center text-on-primary shadow-md shadow-primary/25">
            <span className="material-symbols-outlined text-base">smart_toy</span>
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-on-surface tracking-tight font-headline leading-tight">
              AIDLC Control Platform
            </h1>
            <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest opacity-80">
              v1.2.4
            </p>
          </div>
        </div>
        <nav className="space-y-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 group border',
                  isActive
                    ? "bg-primary/12 border-primary/30 text-primary font-bold relative before:content-[''] before:absolute before:left-0 before:w-1 before:h-6 before:bg-primary before:rounded-r-full"
                    : 'text-on-surface-variant border-transparent hover:bg-surface-container hover:text-on-surface font-medium',
                )
              }
            >
              <span
                className={cn(
                  'material-symbols-outlined mr-3 text-xl transition-transform duration-200',
                  'group-hover:scale-105',
                )}
              >
                {item.icon}
              </span>
              <span className="text-[11px] tracking-wide uppercase font-label">{item.title}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="mt-auto p-6">
        <Button variant="primary" className="w-full py-3 text-sm">
          <span className="material-symbols-outlined text-base">play_arrow</span>
          Run Agent
        </Button>
      </div>
    </aside>
  );
};
