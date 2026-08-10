import * as React from "react";
import DarkModeIcon from "@mui/icons-material/DarkModeRounded";
import LightModeIcon from "@mui/icons-material/LightModeRounded";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { useColorScheme } from "@mui/material/styles";

export default function ColorModeIconDropdown(props: { sx?: object; size?: "small" | "medium" | "large" }) {
  const { mode, setMode } = useColorScheme();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => { setAnchorEl(event.currentTarget); };
  const handleClose = () => { setAnchorEl(null); };
  const handleMode = (targetMode: "light" | "dark" | "system") => () => {
    setMode(targetMode);
    handleClose();
  };
  if (!mode) return null;
  const resolvedIcon = mode === "dark" ? <DarkModeIcon /> : <LightModeIcon />;
  return (
    <>
      <IconButton onClick={handleClick} {...props} color="default" aria-label="color mode">
        {resolvedIcon}
      </IconButton>
      <Menu anchorEl={anchorEl} id="color-mode-menu" open={open} onClose={handleClose}
        onClick={handleClose}
        slotProps={{ paper: { variant: "outlined", sx: { my: "4px" } } }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}>
        <MenuItem selected={mode === "system"} onClick={handleMode("system")}>System default</MenuItem>
        <MenuItem selected={mode === "light"} onClick={handleMode("light")}>Light</MenuItem>
        <MenuItem selected={mode === "dark"} onClick={handleMode("dark")}>Dark</MenuItem>
      </Menu>
    </>
  );
}