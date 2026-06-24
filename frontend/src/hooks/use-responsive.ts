import { useWindowDimensions } from "react-native";

export type Breakpoint = "phone" | "tablet" | "wide";

const PHONE_MAX = 600;
const TABLET_MAX = 1024;

const CONTENT_MAX_WIDTH = 720;

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  let bp: Breakpoint;
  if (width <= PHONE_MAX) bp = "phone";
  else if (width <= TABLET_MAX) bp = "tablet";
  else bp = "wide";

  const isPhone = bp === "phone";
  const isTablet = bp === "tablet" || bp === "wide";

  const contentWidth = isTablet ? Math.min(width, CONTENT_MAX_WIDTH) : width;
  const sidePad = isTablet ? Math.max((width - contentWidth) / 2, 0) : 0;

  const columns = isTablet ? (bp === "wide" ? 4 : 3) : 2;

  return {
    width,
    height,
    bp,
    isPhone,
    isTablet,
    contentWidth,
    sidePad,
    columns,
  };
}
