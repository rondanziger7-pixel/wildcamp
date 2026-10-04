import L from 'leaflet';
import { PIN_SVG } from './pin';

/** The marker for the spot being checked: a red pin whose tip sits on the position. */
export const spotIcon = () =>
  L.divIcon({ className: 'spot-pin', html: PIN_SVG, iconSize: [32, 44], iconAnchor: [16, 42], tooltipAnchor: [0, -38] });
