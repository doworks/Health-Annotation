import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';

const generateId = () => `part-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Convert hex + opacity to rgba
const hexToRgba = (hex, opacity) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export default function TemplatePartEditor() {
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const [template, setTemplate] = useState(null);
  const [parts, setParts] = useState([]);
  const [selectedPartId, setSelectedPartId] = useState(null);
  const [imageFileId, setImageFileId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Track which Excalidraw element IDs map to which parts
  const elementToPartRef = useRef({});   // excalidraw element id -> part local id
  const partToElementRef = useRef({});   // part local id -> excalidraw element id
  const partsRef = useRef(parts);
  const imageLayoutRef = useRef(null);   // { x, y, renderedWidth, renderedHeight }

  useEffect(() => { partsRef.current = parts; }, [parts]);

  const templateName = new URLSearchParams(window.location.search).get('template');

  // Load template info + existing parts
  useEffect(() => {
    if (!templateName) {
      frappe.msgprint({ title: 'Error', message: 'No template specified. Use ?template=TEMPLATE_NAME', indicator: 'red' });
      return;
    }

    frappe.db.get_doc('Annotation Template', templateName).then(doc => {
      setTemplate(doc);
    });

    frappe.call({
      method: 'annotation.api.get_template_parts',
      args: { template: templateName },
      callback(r) {
        const loaded = (r.message || []).map(part => {
          const localId = generateId();
          return {
            ...part,
            localId,
            opacity: parseFloat(part.opacity) || 0.2,
            variables: part.variables || [],
          };
        });
        setParts(loaded);
      },
    });
  }, [templateName]);

  // Load template image into Excalidraw once API + template are ready
  useEffect(() => {
    if (!excalidrawAPI || !template) return;

    const image = new Image();
    image.src = template.image;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const dataURL = canvas.toDataURL('image/jpeg');

      const fileId = `template-${template.name}-${Date.now()}`;
      setImageFileId(fileId);

      const container = document.querySelector('.excalidraw__canvas');
      const canvasHeight = container ? container.clientHeight : 800;
      const canvasWidth = container ? container.clientWidth : 1200;

      const scaleFactor = canvasHeight / image.height;
      const imageX = (canvasWidth - image.width * scaleFactor) / 2;

      const imageElement = {
        type: 'image',
        version: 1,
        versionNonce: 123456,
        isDeleted: false,
        id: `template-image-${template.name}`,
        fillStyle: 'solid',
        strokeWidth: 0,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        angle: 0,
        x: imageX,
        y: 0,
        width: image.width * scaleFactor,
        height: image.height * scaleFactor,
        seed: 1,
        groupIds: [],
        status: 'pending',
        backgroundColor: 'transparent',
        strokeColor: 'transparent',
        boundElements: null,
        fileId: fileId,
        frameId: null,
        link: null,
        locked: true,
        roundness: null,
        scale: [1, 1],
        updated: Date.now(),
      };

      imageLayoutRef.current = {
        x: imageX,
        y: 0,
        renderedWidth: image.width * scaleFactor,
        renderedHeight: image.height * scaleFactor,
      };

      excalidrawAPI.updateScene({
        elements: [imageElement],
        commitToHistory: true,
      });

      excalidrawAPI.addFiles([{
        mimeType: 'image/jpeg',
        id: fileId,
        dataURL: dataURL,
        created: Date.now(),
      }]);

      setTimeout(() => {
        excalidrawAPI.scrollToContent();
        excalidrawAPI.refresh();
      }, 100);
    };
  }, [excalidrawAPI, template]);

  // Once parts are loaded AND image is on canvas, render existing part polygons
  useEffect(() => {
    if (!excalidrawAPI || !imageFileId || parts.length === 0) return;
    // Only run once: if we already mapped elements, skip
    if (Object.keys(elementToPartRef.current).length > 0) return;

    const existingElements = excalidrawAPI.getSceneElements();
    const newElements = [];

    const layout = imageLayoutRef.current;
    if (!layout) return;

    parts.forEach(part => {
      if (!part.shape_json) return;
      let coords;
      try {
        coords = typeof part.shape_json === 'string' ? JSON.parse(part.shape_json) : part.shape_json;
      } catch { return; }
      if (!Array.isArray(coords) || coords.length < 2) return;

      // Convert relative 0-1 coords to absolute Excalidraw line element
      const absPoints = coords.map(([rx, ry]) => [
        rx * layout.renderedWidth + layout.x,
        ry * layout.renderedHeight + layout.y,
      ]);
      const originX = absPoints[0][0];
      const originY = absPoints[0][1];
      const relPoints = absPoints.map(([ax, ay]) => [ax - originX, ay - originY]);

      const elementId = generateId();
      const element = {
        type: 'line',
        version: 1,
        versionNonce: Date.now(),
        isDeleted: false,
        id: elementId,
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        angle: 0,
        x: originX,
        y: originY,
        width: 0,
        height: 0,
        seed: Math.floor(Math.random() * 100000),
        groupIds: [],
        frameId: null,
        roundness: { type: 2 },
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        points: relPoints,
        lastCommittedPoint: relPoints[relPoints.length - 1],
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: null,
        strokeColor: part.color || '#4dabf7',
        backgroundColor: hexToRgba(part.color || '#4dabf7', part.opacity || 0.2),
      };

      elementToPartRef.current[elementId] = part.localId;
      partToElementRef.current[part.localId] = elementId;
      newElements.push(element);
    });

    if (newElements.length > 0) {
      excalidrawAPI.updateScene({
        elements: [...existingElements, ...newElements],
        commitToHistory: true,
      });
    }
  }, [excalidrawAPI, imageFileId, parts]);

  const selectedPart = parts.find(p => p.localId === selectedPartId);

  const updatePart = (localId, updates) => {
    setParts(prev => prev.map(p => p.localId === localId ? { ...p, ...updates } : p));
  };

  // When user finishes drawing a line element, capture it as a new part
  const lastElementCountRef = useRef(0);

  const handleChange = useCallback((elements, appState) => {
    // Detect newly added line elements (polygons)
    const lineElements = elements.filter(
      el => el.type === 'line' && !el.isDeleted && !elementToPartRef.current[el.id]
    );

    if (lineElements.length > 0 && !appState.editingLinearElement) {
      lineElements.forEach(el => {
        // Only capture completed lines (not currently being drawn)
        if (el.points && el.points.length >= 3) {
          const localId = generateId();
          const newPart = {
            localId,
            name: null,
            part_name: `Part ${partsRef.current.length + 1}`,
            color: '#4dabf7',
            opacity: 0.2,
            shape_json: null,
            variables: [],
          };
          elementToPartRef.current[el.id] = localId;
          partToElementRef.current[localId] = el.id;
          setParts(prev => [...prev, newPart]);
          setSelectedPartId(localId);
        }
      });
    }
  }, []);

  const handlePointerDown = useCallback((activeTool, pointerDownState) => {
    const hit = pointerDownState.hit?.element;
    if (hit && hit.type === 'line' && elementToPartRef.current[hit.id]) {
      setSelectedPartId(elementToPartRef.current[hit.id]);
    } else if (activeTool.type === 'selection') {
      // Don't deselect if clicking sidebar
    }
  }, []);

  // Update Excalidraw element visuals when part color/opacity changes
  useEffect(() => {
    if (!excalidrawAPI || !selectedPart) return;
    const elementId = partToElementRef.current[selectedPart.localId];
    if (!elementId) return;

    const elements = excalidrawAPI.getSceneElements().map(el => {
      if (el.id === elementId) {
        return {
          ...el,
          strokeColor: selectedPart.color,
          backgroundColor: hexToRgba(selectedPart.color, selectedPart.opacity),
          fillStyle: 'solid',
        };
      }
      return el;
    });
    excalidrawAPI.updateScene({ elements });
  }, [selectedPart?.color, selectedPart?.opacity]);

  const deletePart = (localId) => {
    const elementId = partToElementRef.current[localId];
    if (elementId && excalidrawAPI) {
      const elements = excalidrawAPI.getSceneElements().map(el => {
        if (el.id === elementId) return { ...el, isDeleted: true };
        return el;
      });
      excalidrawAPI.updateScene({ elements });
    }
    delete elementToPartRef.current[partToElementRef.current[localId]];
    delete partToElementRef.current[localId];
    setParts(prev => prev.filter(p => p.localId !== localId));
    if (selectedPartId === localId) setSelectedPartId(null);
  };

  const addVariable = (localId) => {
    updatePart(localId, {
      variables: [...(parts.find(p => p.localId === localId)?.variables || []),
        { variable_name: '', type: 'Data', options: '' }],
    });
  };

  const updateVariable = (localId, varIndex, field, value) => {
    const part = parts.find(p => p.localId === localId);
    if (!part) return;
    const newVars = part.variables.map((v, i) =>
      i === varIndex ? { ...v, [field]: value } : v
    );
    updatePart(localId, { variables: newVars });
  };

  const removeVariable = (localId, varIndex) => {
    const part = parts.find(p => p.localId === localId);
    if (!part) return;
    updatePart(localId, { variables: part.variables.filter((_, i) => i !== varIndex) });
  };

  const handleSave = async () => {
    if (!excalidrawAPI) return;
    setSaving(true);

    const elements = excalidrawAPI.getSceneElements();
    const layout = imageLayoutRef.current;
    if (!layout) {
      frappe.msgprint({ title: 'Error', message: 'Template image not loaded yet.', indicator: 'red' });
      setSaving(false);
      return;
    }

    // Build the parts payload — convert Excalidraw elements to relative 0-1 coords
    const payload = parts.map(part => {
      const elementId = partToElementRef.current[part.localId];
      const element = elements.find(el => el.id === elementId);

      let shapeJson = part.shape_json;
      if (element && element.points) {
        const relativeCoords = element.points.map(([dx, dy]) => {
          const absX = element.x + dx;
          const absY = element.y + dy;
          return [
            (absX - layout.x) / layout.renderedWidth,
            (absY - layout.y) / layout.renderedHeight,
          ];
        });
        shapeJson = JSON.stringify(relativeCoords);
      }

      return {
        name: part.name || undefined,
        part_name: part.part_name,
        shape_json: shapeJson,
        color: part.color,
        opacity: part.opacity,
        variables: part.variables.filter(v => v.variable_name),
      };
    });

    try {
      const result = await new Promise((resolve, reject) => {
        frappe.call({
          method: 'annotation.api.save_template_parts',
          args: { template: templateName, parts: JSON.stringify(payload) },
          callback(r) { resolve(r.message); },
          error(err) { reject(err); },
        });
      });

      // Update local parts with saved names
      if (result && Array.isArray(result)) {
        setParts(prev => prev.map((part, i) => {
          if (result[i]) {
            return { ...part, name: result[i].name };
          }
          return part;
        }));
      }

      frappe.msgprint({ title: 'Saved', message: 'Template parts saved successfully!', indicator: 'green' });
    } catch {
      frappe.msgprint({ title: 'Error', message: 'Failed to save template parts.', indicator: 'red' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 113px)', display: 'flex' }}>
      {/* Excalidraw Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Excalidraw
          UIOptions={{ canvasActions: { saveToActiveFile: false } }}
          onChange={handleChange}
          onPointerDown={handlePointerDown}
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          initialData={{
            elements: [],
            appState: {
              activeTool: { type: 'line' },
              currentItemStrokeColor: '#4dabf7',
            },
            scrollToContent: true,
          }}
        />
      </div>

      {/* Right Sidebar */}
      <div style={{
        width: 320,
        background: '#fff',
        borderLeft: '1px solid #e0e0e0',
        overflowY: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Template Parts</h3>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: '#4dabf7',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 16px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {saving ? 'Saving...' : 'Save All'}
          </button>
        </div>

        {template && (
          <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
            Template: <strong>{template.label || template.name}</strong>
          </div>
        )}

        <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
          Draw closed polygons (line tool) on the image to create parts. Click a part to edit.
        </div>

        {/* Parts List */}
        {parts.map((part) => (
          <div
            key={part.localId}
            onClick={() => setSelectedPartId(part.localId)}
            style={{
              border: selectedPartId === part.localId ? '2px solid #4dabf7' : '1px solid #e0e0e0',
              borderRadius: 8,
              padding: 12,
              cursor: 'pointer',
              background: selectedPartId === part.localId ? '#f0f8ff' : '#fafafa',
            }}
          >
            {/* Part Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 3,
                  background: hexToRgba(part.color, part.opacity),
                  border: `2px solid ${part.color}`,
                }} />
                <strong style={{ fontSize: 14 }}>{part.part_name || 'Unnamed Part'}</strong>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deletePart(part.localId); }}
                style={{ background: 'none', border: 'none', color: '#e03131', cursor: 'pointer', fontSize: 16 }}
                title="Delete part"
              >
                ✕
              </button>
            </div>

            {/* Expanded Detail */}
            {selectedPartId === part.localId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onClick={e => e.stopPropagation()}>
                {/* Part Name */}
                <div>
                  <label style={labelStyle}>Part Name</label>
                  <input
                    value={part.part_name}
                    onChange={e => updatePart(part.localId, { part_name: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                {/* Color */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Color</label>
                    <input
                      type="color"
                      value={part.color}
                      onChange={e => updatePart(part.localId, { color: e.target.value })}
                      style={{ width: '100%', height: 32, border: 'none', cursor: 'pointer' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Opacity: {part.opacity}</label>
                    <input
                      type="range"
                      min="0" max="1" step="0.05"
                      value={part.opacity}
                      onChange={e => updatePart(part.localId, { opacity: parseFloat(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Variables */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ ...labelStyle, fontWeight: 600 }}>Variables</label>
                    <button
                      onClick={() => addVariable(part.localId)}
                      style={smallBtnStyle}
                    >
                      + Add
                    </button>
                  </div>
                  {part.variables.map((v, vi) => (
                    <div key={vi} style={{ border: '1px solid #eee', borderRadius: 6, padding: 8, marginTop: 6, background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#999' }}>Variable {vi + 1}</span>
                        <button
                          onClick={() => removeVariable(part.localId, vi)}
                          style={{ background: 'none', border: 'none', color: '#e03131', cursor: 'pointer', fontSize: 13 }}
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        placeholder="Variable name"
                        value={v.variable_name}
                        onChange={e => updateVariable(part.localId, vi, 'variable_name', e.target.value)}
                        style={{ ...inputStyle, marginBottom: 4 }}
                      />
                      <select
                        value={v.type}
                        onChange={e => updateVariable(part.localId, vi, 'type', e.target.value)}
                        style={{ ...inputStyle, marginBottom: 4 }}
                      >
                        <option value="Data">Data (Text)</option>
                        <option value="Select">Select (Options)</option>
                      </select>
                      {v.type === 'Select' && (
                        <textarea
                          placeholder="Options (one per line)"
                          value={v.options}
                          onChange={e => updateVariable(part.localId, vi, 'options', e.target.value)}
                          style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {parts.length === 0 && (
          <div style={{ color: '#aaa', textAlign: 'center', padding: 24 }}>
            No parts yet. Use the line tool to draw polygons on the template image.
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  color: '#555',
  marginBottom: 2,
};

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 13,
  boxSizing: 'border-box',
};

const smallBtnStyle = {
  background: '#e9ecef',
  border: 'none',
  borderRadius: 4,
  padding: '2px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
