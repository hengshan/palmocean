// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import {IndexRoute, Route} from 'react-router';
import React from 'react';
import Demo from '../app';

export function onAuthEnterCallback(nextState, replace, callback) {
  callback();
}

export function buildAppRoutes(Component) {
  return [
    <Route key="auth" path="auth" component={Demo} onEnter={onAuthEnterCallback} />,
    <Route key="demo" path="demo">
      <IndexRoute component={Component} />
      <Route path="map" component={Component} />
      <Route path="(:id)" component={Component} />
      <Route path="map/:provider" component={Component} />
    </Route>
  ];
}
