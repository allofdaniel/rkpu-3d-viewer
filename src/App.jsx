import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Use default Cesium terrain without Ion token
window.CESIUM_BASE_URL = '/cesium/';

const COLORS = {
  SID: Cesium.Color.fromCssColorString('#00C853'),
  STAR: Cesium.Color.fromCssColorString('#FF6D00'),
  APPROACH: Cesium.Color.fromCssColorString('#2979FF'),
  waypoint: Cesium.Color.fromCssColorString('#FFEB3B'),
  obstacle_building: Cesium.Color.fromCssColorString('#F44336'),
  obstacle_tower: Cesium.Color.fromCssColorString('#FF5722'),
  obstacle_natural: Cesium.Color.fromCssColorString('#4CAF50'),
  obstacle_tree: Cesium.Color.fromCssColorString('#8BC34A'),
  obstacle_navaid: Cesium.Color.fromCssColorString('#9C27B0'),
  obstacle_etc: Cesium.Color.fromCssColorString('#607D8B'),
  airspace: Cesium.Color.fromCssColorString('#E91E63').withAlpha(0.2),
  runway: Cesium.Color.fromCssColorString('#FFFFFF'),
};

const OBSTACLE_COLORS = {
  Building: COLORS.obstacle_building,
  Tower: COLORS.obstacle_tower,
  Natural: COLORS.obstacle_natural,
  Tree: COLORS.obstacle_tree,
  Navaid: COLORS.obstacle_navaid,
  ETC: COLORS.obstacle_etc,
};

function App() {
  const cesiumContainer = useRef(null);
  const viewerRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState({
    waypoints: true,
    obstacles: true,
    airspace: true,
    SID: false,
    STAR: false,
    APPROACH: true,
  });
  const [waypointSources, setWaypointSources] = useState({});
  const [obstacleTypes, setObstacleTypes] = useState({
    Building: true,
    Tower: true,
    Natural: true,
    Tree: true,
    Navaid: true,
    ETC: true,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({
    waypoints: true,
    obstacles: true,
    procedures: true,
  });
  const entitiesRef = useRef({});

  // Load data
  useEffect(() => {
    fetch('/aviation_data.json')
      .then((res) => res.json())
      .then((json) => {
        setData(json);

        // Initialize waypoint sources
        const sources = {};
        Object.values(json.waypoints).forEach((wp) => {
          wp.sources.forEach((src) => {
            if (!sources[src]) sources[src] = true;
          });
        });
        setWaypointSources(sources);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load data:', err);
        setLoading(false);
      });
  }, []);

  // Initialize Cesium
  useEffect(() => {
    if (!cesiumContainer.current || viewerRef.current) return;

    const viewer = new Cesium.Viewer(cesiumContainer.current, {
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      selectionIndicator: true,
      infoBox: true,
      imageryProvider: new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/'
      }),
    });

    viewer.scene.globe.enableLighting = false;

    // Set initial camera position to Ulsan Airport
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(129.3518, 35.5934, 25000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 2,
    });

    viewerRef.current = viewer;

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // Render entities when data or layers change
  useEffect(() => {
    if (!viewerRef.current || !data) return;

    const viewer = viewerRef.current;

    // Clear existing entities
    viewer.entities.removeAll();
    entitiesRef.current = {
      waypoints: [],
      obstacles: [],
      airspace: [],
      procedures: [],
    };

    // Add runway
    addRunway(viewer);

    // Add waypoints
    if (layers.waypoints) {
      Object.entries(data.waypoints).forEach(([name, wp]) => {
        // Filter by search term
        if (searchTerm && !name.toLowerCase().includes(searchTerm.toLowerCase())) {
          return;
        }

        // Filter by selected sources
        const hasActiveSource = wp.sources.some((src) => waypointSources[src]);
        if (!hasActiveSource) return;

        const altitude = wp.altitude || 100;
        const entity = viewer.entities.add({
          name: name,
          position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, altitude),
          point: {
            pixelSize: 8,
            color: COLORS.waypoint,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
          },
          label: {
            text: name,
            font: '12px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000),
          },
          description: `
            <h3>${name}</h3>
            <p><strong>위치:</strong> ${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}</p>
            <p><strong>고도:</strong> ${altitude}m</p>
            <p><strong>출처:</strong> ${wp.sources.join(', ')}</p>
          `,
        });
        entitiesRef.current.waypoints.push(entity);
      });
    }

    // Add obstacles
    if (layers.obstacles) {
      data.obstacles.forEach((obs) => {
        if (!obstacleTypes[obs.type]) return;

        if (searchTerm && !obs.id.toLowerCase().includes(searchTerm.toLowerCase())) {
          return;
        }

        const color = OBSTACLE_COLORS[obs.type] || COLORS.obstacle_etc;
        const entity = viewer.entities.add({
          name: `장애물 #${obs.id}`,
          position: Cesium.Cartesian3.fromDegrees(obs.lon, obs.lat, obs.elevation / 2),
          cylinder: {
            length: obs.elevation,
            topRadius: 20,
            bottomRadius: 30,
            material: color.withAlpha(0.8),
            outline: true,
            outlineColor: color,
          },
          label: {
            text: `#${obs.id}`,
            font: '10px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 20000),
          },
          description: `
            <h3>장애물 #${obs.id}</h3>
            <p><strong>유형:</strong> ${obs.type}</p>
            <p><strong>위치:</strong> ${obs.lat.toFixed(6)}, ${obs.lon.toFixed(6)}</p>
            <p><strong>표고:</strong> ${obs.elevation}m</p>
          `,
        });
        entitiesRef.current.obstacles.push(entity);
      });
    }

    // Add airspace
    if (layers.airspace && data.airspace) {
      data.airspace.forEach((as) => {
        if (!as.coordinates || !as.coordinates[0]) return;

        const positions = as.coordinates[0].map((coord) =>
          Cesium.Cartesian3.fromDegrees(coord[0], coord[1], as.top_alt || 3000)
        );

        const entity = viewer.entities.add({
          name: as.name || 'Airspace',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            material: COLORS.airspace,
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#E91E63'),
            extrudedHeight: as.top_alt || 3000,
            height: as.base_alt || 0,
          },
          description: `
            <h3>${as.name || 'Airspace'}</h3>
            <p><strong>하한:</strong> ${as.base_alt || 0}m</p>
            <p><strong>상한:</strong> ${as.top_alt || 0}m</p>
          `,
        });
        entitiesRef.current.airspace.push(entity);
      });
    }

    // Add procedures
    ['SID', 'STAR', 'APPROACH'].forEach((procType) => {
      if (!layers[procType] || !data.procedures[procType]) return;

      data.procedures[procType].forEach((proc) => {
        const color = COLORS[procType];

        if (proc.coordinates && proc.coordinates.length >= 2) {
          // Convert 2D coordinates to 3D with altitude
          const positions = proc.coordinates.map((coord, idx) => {
            const altitude = 500 + (idx * 50); // Gradual altitude increase
            return Cesium.Cartesian3.fromDegrees(coord[0], coord[1], altitude);
          });

          const entity = viewer.entities.add({
            name: proc.name,
            polyline: {
              positions: positions,
              width: 4,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.3,
                color: color,
              }),
            },
            description: `
              <h3>${proc.name}</h3>
              <p><strong>유형:</strong> ${procType}</p>
              <p><strong>테이블:</strong> ${proc.table}</p>
            `,
          });
          entitiesRef.current.procedures.push(entity);
        }

        // Add legs if available
        if (proc.legs) {
          proc.legs.forEach((leg, idx) => {
            if (!leg.coordinates || leg.coordinates.length < 2) return;

            const positions = leg.coordinates.map((coord) => {
              const altitude = leg.start_alt || leg.end_alt || 1000;
              return Cesium.Cartesian3.fromDegrees(coord[0], coord[1], altitude);
            });

            const entity = viewer.entities.add({
              name: `${proc.name} - Leg ${leg.seq || idx + 1}`,
              polyline: {
                positions: positions,
                width: 3,
                material: color,
              },
              description: `
                <h3>${proc.name} - Leg ${leg.seq || idx + 1}</h3>
                <p><strong>시작 고도:</strong> ${leg.start_alt || 'N/A'}m</p>
                <p><strong>종료 고도:</strong> ${leg.end_alt || 'N/A'}m</p>
              `,
            });
            entitiesRef.current.procedures.push(entity);
          });
        }
      });
    });

  }, [data, layers, waypointSources, obstacleTypes, searchTerm]);

  const addRunway = (viewer) => {
    // Runway 18/36 approximate coordinates
    const runwayStart = [129.3505, 35.5890];
    const runwayEnd = [129.3530, 35.5978];

    viewer.entities.add({
      name: 'Runway 18/36',
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          runwayStart[0], runwayStart[1],
          runwayEnd[0], runwayEnd[1],
        ]),
        width: 15,
        material: COLORS.runway,
        clampToGround: true,
      },
      description: `
        <h3>Runway 18/36</h3>
        <p>울산공항 활주로</p>
      `,
    });
  };

  const toggleLayer = (layer) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const toggleObstacleType = (type) => {
    setObstacleTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const flyToAirport = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(129.3518, 35.5934, 15000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.5,
      });
    }
  };

  if (loading) {
    return <div className="loading">데이터 로딩 중...</div>;
  }

  return (
    <div className="app-container">
      <div ref={cesiumContainer} id="cesiumContainer" />

      <div className="control-panel">
        <div className="panel-header">
          <span>울산공항 3D 뷰어</span>
          <span className="airport-code">RKPU</span>
        </div>

        <div className="stats-bar">
          <div className="stat-item">
            <span>웨이포인트:</span>
            <span className="stat-value">{data ? Object.keys(data.waypoints).length : 0}</span>
          </div>
          <div className="stat-item">
            <span>장애물:</span>
            <span className="stat-value">{data ? data.obstacles.length : 0}</span>
          </div>
          <div className="stat-item">
            <span>절차:</span>
            <span className="stat-value">
              {data ?
                data.procedures.SID.length +
                data.procedures.STAR.length +
                data.procedures.APPROACH.length : 0}
            </span>
          </div>
        </div>

        <div className="panel-content">
          <div className="search-box">
            <input
              type="text"
              className="search-input"
              placeholder="웨이포인트/장애물 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="section">
            <div className="section-title">기본 레이어</div>
            <div className="toggle-group">
              <div
                className={`toggle-item ${layers.waypoints ? 'active' : ''}`}
                onClick={() => toggleLayer('waypoints')}
              >
                <input
                  type="checkbox"
                  className="toggle-checkbox"
                  checked={layers.waypoints}
                  onChange={() => {}}
                />
                <span className="toggle-label">웨이포인트</span>
                <div className="toggle-color" style={{ background: '#FFEB3B' }} />
              </div>
              <div
                className={`toggle-item ${layers.obstacles ? 'active' : ''}`}
                onClick={() => toggleLayer('obstacles')}
              >
                <input
                  type="checkbox"
                  className="toggle-checkbox"
                  checked={layers.obstacles}
                  onChange={() => {}}
                />
                <span className="toggle-label">장애물</span>
                <div className="toggle-color" style={{ background: '#F44336' }} />
              </div>
              <div
                className={`toggle-item ${layers.airspace ? 'active' : ''}`}
                onClick={() => toggleLayer('airspace')}
              >
                <input
                  type="checkbox"
                  className="toggle-checkbox"
                  checked={layers.airspace}
                  onChange={() => {}}
                />
                <span className="toggle-label">공역</span>
                <div className="toggle-color" style={{ background: '#E91E63' }} />
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-title">비행 절차</div>
            <div className="toggle-group">
              <div
                className={`toggle-item ${layers.SID ? 'active' : ''}`}
                onClick={() => toggleLayer('SID')}
              >
                <input
                  type="checkbox"
                  className="toggle-checkbox"
                  checked={layers.SID}
                  onChange={() => {}}
                />
                <span className="toggle-label">SID (표준계기출발)</span>
                <div className="toggle-color" style={{ background: '#00C853' }} />
              </div>
              <div
                className={`toggle-item ${layers.STAR ? 'active' : ''}`}
                onClick={() => toggleLayer('STAR')}
              >
                <input
                  type="checkbox"
                  className="toggle-checkbox"
                  checked={layers.STAR}
                  onChange={() => {}}
                />
                <span className="toggle-label">STAR (표준도착경로)</span>
                <div className="toggle-color" style={{ background: '#FF6D00' }} />
              </div>
              <div
                className={`toggle-item ${layers.APPROACH ? 'active' : ''}`}
                onClick={() => toggleLayer('APPROACH')}
              >
                <input
                  type="checkbox"
                  className="toggle-checkbox"
                  checked={layers.APPROACH}
                  onChange={() => {}}
                />
                <span className="toggle-label">접근 절차</span>
                <div className="toggle-color" style={{ background: '#2979FF' }} />
              </div>
            </div>
          </div>

          <div className="section">
            <div
              className="category-header"
              onClick={() => toggleCategory('obstacles')}
            >
              <span className="category-icon">🏗️</span>
              <span className="category-name">장애물 유형</span>
              <span className="category-toggle">{expandedCategories.obstacles ? '▼' : '▶'}</span>
            </div>
            {expandedCategories.obstacles && (
              <div className="sub-items">
                {Object.entries(obstacleTypes).map(([type, enabled]) => (
                  <div
                    key={type}
                    className={`toggle-item ${enabled ? 'active' : ''}`}
                    onClick={() => toggleObstacleType(type)}
                  >
                    <input
                      type="checkbox"
                      className="toggle-checkbox"
                      checked={enabled}
                      onChange={() => {}}
                    />
                    <span className="toggle-label">{type}</span>
                    <div
                      className="toggle-color"
                      style={{
                        background: OBSTACLE_COLORS[type]?.toCssColorString() || '#607D8B'
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="section">
            <div className="info-box">
              <div className="info-label">공항 정보</div>
              <div className="info-value">{data?.airport?.name_kr || '울산공항'}</div>
              <div style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '4px' }}>
                ICAO: {data?.airport?.icao || 'RKPU'} |
                표고: {data?.airport?.elevation || 14}m
              </div>
            </div>
          </div>

          <div className="section">
            <button
              onClick={flyToAirport}
              style={{
                width: '100%',
                padding: '10px',
                background: '#1a73e8',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
              }}
            >
              공항으로 이동
            </button>
          </div>

          <div className="section">
            <div className="section-title">범례</div>
            <div className="legend">
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#FFEB3B' }} />
                <span>웨이포인트</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#F44336' }} />
                <span>건물</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#FF5722' }} />
                <span>타워</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#4CAF50' }} />
                <span>자연물</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#00C853' }} />
                <span>SID</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#FF6D00' }} />
                <span>STAR</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#2979FF' }} />
                <span>접근</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
