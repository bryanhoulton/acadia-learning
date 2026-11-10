import {
  Image,
  ImageSourcePropType,
} from 'react-native';

interface LogoProps {
  variant?: "primary" | "white" | "black";
  width?: number;
  height?: number;
}

const logoVariants: Record<string, ImageSourcePropType> = {
  primary: require("@/assets/images/logo-primary.png"),
  white: require("@/assets/images/logo-white.png"),
  black: require("@/assets/images/logo-black.png"),
};

export const Logo = ({
  variant = "primary",
  width = 120,
  height = 120,
}: LogoProps) => {
  const source = logoVariants[variant];

  return <Image source={source} style={{ width, height }} />;
};
