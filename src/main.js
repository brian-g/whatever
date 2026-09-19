import Aurelia from 'aurelia';
import { MyApp } from './my-app';
import './app.css';

import { GpxDropZone } from './components/gpx-drop-zone';
import { RouteMap } from './components/route-map';
import { StatTiles } from './components/stat-tiles';
import { ElevationProfile } from './components/elevation-profile';
import { SplitsTable } from './components/splits-table';
import { PassEvents } from './components/pass-events';

Aurelia
  // Registered globally so the shell can use them without per-template <import> elements.
  .register(GpxDropZone, RouteMap, StatTiles, ElevationProfile, SplitsTable, PassEvents)
  .app(MyApp)
  .start();
