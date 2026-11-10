import { LucideIcon } from 'lucide-react';
import {
  Link,
  useLocation,
} from 'react-router-dom';
import {
  Button,
  cn,
} from 'slate-ui';

interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
}

function NavItem({ href, label, icon }: NavItemProps) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(href);

  return (
    <Link to={href}>
      <Button
        iconLeft={icon}
        variant="subtle"
        className={cn(
          !isActive && "hover:bg-primary-400 text-primary-100",
          isActive && "font-semibold bg-white text-black",
          "w-full justify-start gap-2 text-sm cursor-pointer"
        )}
        styles={{
          icon: {
            color: isActive ? "var(--primary)" : "var(--primary-100)",
          },
          root: {
            boxShadow: "none",
          },
        }}
      >
        {label}
      </Button>
    </Link>
  );
}

export default NavItem;
