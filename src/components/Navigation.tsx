import { useEffect, useRef, useState } from 'react';

import { joinBasePath } from '../lib/site-path';
import styles from './Navigation.module.css';

type NavigationProps = {
  basePath: string;
  currentPath: string;
};

const items = [
  { label: '博客', pathname: '/blog/' },
  { label: '随笔', pathname: '/notes/' },
  { label: '项目', pathname: '/projects/' },
  { label: '推荐', pathname: '/recommendations/' },
  { label: '关于', pathname: '/about/' },
];

export const Navigation = ({ basePath, currentPath }: NavigationProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      toggleRef.current?.focus();
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !navigationRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePress);
    };
  }, [isOpen]);

  return (
    <nav ref={navigationRef} className={styles.navigation} aria-label="主导航">
      <button
        ref={toggleRef}
        className={styles.toggle}
        type="button"
        aria-expanded={isOpen}
        aria-controls="site-navigation"
        aria-label={isOpen ? '关闭导航' : '打开导航'}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{isOpen ? '收起' : '菜单'}</span>
        <span className={styles.menuIcon} data-open={isOpen} aria-hidden="true">
          <span />
          <span />
        </span>
      </button>
      <ul className={styles.links} id="site-navigation" data-open={isOpen}>
        {items.map(({ label, pathname }) => {
          const href = joinBasePath(basePath, pathname);

          return (
            <li key={pathname}>
              <a
                href={href}
                aria-current={currentPath === href ? 'page' : undefined}
                onClick={() => setIsOpen(false)}
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default Navigation;
