import React from 'react';
import { APP_VERSION } from '../config/version';

const TopHeader = React.memo(function TopHeader() {
  return (
    <div className="top-header">
      <span className="top-header-title">Counseling Homework</span>
      <span className="top-header-right">
        <span className="top-header-version">v{APP_VERSION}</span>
        <span className="top-header-beta">BETA</span>
      </span>
    </div>
  );
});

export default TopHeader;
