import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Excalidraw, Sidebar, Footer, exportToBlob } from '@excalidraw/excalidraw';

import { 
  List, ListItemDecorator, ListItemButton, Tabs, TabList, Tab, TabPanel, Radio, 
  RadioGroup, Sheet, Button, Badge, FormLabel, Input, Card,
} from '@mui/joy';
import Drawer from '@mui/joy/Drawer';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import ModalClose from '@mui/joy/ModalClose';
import Divider from '@mui/joy/Divider';

import { tabClasses } from '@mui/joy/Tab';
import { radioClasses } from '@mui/joy/Radio';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import Select from 'react-select'

const generateFileId = (img) => {
  // Generate a unique fileId using a combination of the image name and a timestamp or any other unique identifier
  return `${img.name}-${Date.now()}`;
};

const convertBlobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Create the base64 string with the MIME type prefix
      const base64String = reader.result;
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const options = { year: "numeric", month: "long", day: "numeric" }; // Customize format
  return date.toLocaleDateString("en-US", options);
};

const hexWithAlpha = (hex, opacity) => {
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255).toString(16).padStart(2, '0');
  return hex + alpha;
};

const createPartElements = (parts, scaleFactor, imageX, imageY, imageWidth, imageHeight, currentPartValues = {}) => {
  const renderedWidth = imageWidth * scaleFactor;
  const renderedHeight = imageHeight * scaleFactor;
  return parts.map((part, idx) => {
    let points;
    try {
      points = typeof part.shape_json === 'string' ? JSON.parse(part.shape_json) : part.shape_json;
    } catch (e) { return null; }
    if (!points || points.length < 2) return null;

    const firstX = points[0][0] * renderedWidth + imageX;
    const firstY = points[0][1] * renderedHeight + imageY;

    const relativePoints = points.map(p => [
      p[0] * renderedWidth + imageX - firstX,
      p[1] * renderedHeight + imageY - firstY
    ]);
    relativePoints.push([0, 0]); // close polygon

    const hasValues = currentPartValues[part.part_name] &&
      Object.values(currentPartValues[part.part_name]).some(v => v !== '');
    const fillOpacity = hasValues ? 0.35 : 0.08;
    const strokeOpacity = hasValues ? 'ff' : '99';

    return {
      type: 'line',
      version: 1,
      versionNonce: Date.now() + idx,
      isDeleted: false,
      id: `part-${part.name}-${idx}`,
      fillStyle: 'solid',
      strokeWidth: hasValues ? 2 : 1,
      strokeStyle: hasValues ? 'solid' : 'dashed',
      roughness: 0,
      opacity: 100,
      angle: 0,
      x: firstX,
      y: firstY,
      width: Math.max(...relativePoints.map(p => p[0])) - Math.min(...relativePoints.map(p => p[0])),
      height: Math.max(...relativePoints.map(p => p[1])) - Math.min(...relativePoints.map(p => p[1])),
      seed: Date.now() + idx,
      groupIds: [],
      backgroundColor: hexWithAlpha(part.color || '#4dabf7', fillOpacity),
      strokeColor: (part.color || '#4dabf7') + strokeOpacity,
      boundElements: null,
      customData: { partType: 'template_part', partName: part.part_name, partId: part.name },
      frameId: null,
      link: null,
      locked: true,
      roundness: null,
      points: relativePoints,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: null,
      updated: Date.now(),
    };
  }).filter(Boolean);
};

const collectBadgeItems = (elements, partValues, templateParts, treatments) => {
  const items = [];

  // Scan freedraw elements with non-empty customData values
  elements.forEach(el => {
    if (el.type !== 'freedraw' || el.isDeleted || !el.customData) return;
    const { type, ...params } = el.customData;
    if (!type) return;
    const hasValues = Object.values(params).some(v => v !== '' && v !== undefined && v !== null);
    if (!hasValues) return;

    let centroidX = el.x;
    let centroidY = el.y;
    let minY = el.y;
    if (el.points && el.points.length > 0) {
      const avgX = el.points.reduce((sum, p) => sum + p[0], 0) / el.points.length;
      const avgY = el.points.reduce((sum, p) => sum + p[1], 0) / el.points.length;
      centroidX = el.x + avgX;
      centroidY = el.y + avgY;
      minY = el.y + Math.min(...el.points.map(p => p[1]));
    }

    const treatment = treatments.find(t => t.treatment === type);
    items.push({
      type: 'Treatment',
      name: type,
      color: treatment?.color || '#ff6b6b',
      params,
      centroidX,
      centroidY,
      topY: minY,
      boundsW: el.width || 0,
    });
  });

  // Scan template parts with non-empty values
  Object.entries(partValues).forEach(([partName, values]) => {
    if (!values) return;
    const hasValues = Object.values(values).some(v => v !== '' && v !== undefined && v !== null);
    if (!hasValues) return;

    const part = templateParts.find(p => p.part_name === partName);
    const partEl = elements.find(el =>
      el.customData?.partType === 'template_part' && el.customData.partName === partName && !el.isDeleted
    );

    let centroidX = 0;
    let centroidY = 0;
    let minY = 0;
    if (partEl) {
      if (partEl.points && partEl.points.length > 0) {
        const avgX = partEl.points.reduce((sum, p) => sum + p[0], 0) / partEl.points.length;
        const avgY = partEl.points.reduce((sum, p) => sum + p[1], 0) / partEl.points.length;
        centroidX = partEl.x + avgX;
        centroidY = partEl.y + avgY;
        minY = partEl.y + Math.min(...partEl.points.map(p => p[1]));
      } else {
        centroidX = partEl.x + (partEl.width || 0) / 2;
        centroidY = partEl.y + (partEl.height || 0) / 2;
        minY = partEl.y;
      }
    }

    items.push({
      type: 'Area',
      name: partName,
      color: part?.color || '#4dabf7',
      params: values,
      centroidX,
      centroidY,
      topY: minY,
      boundsW: partEl?.width || 0,
    });
  });

  // Sort by Y then X, assign badge numbers
  items.sort((a, b) => a.centroidY - b.centroidY || a.centroidX - b.centroidX);
  return items.map((item, idx) => ({ ...item, badgeNum: idx + 1 }));
};

const getContrastText = (hexColor) => {
  const hex = (hexColor || '#000000').replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5 ? '#ffffff' : '#333333';
};

const generateAnnotationDataHTML = (badgeItems) => {
  if (!badgeItems || badgeItems.length === 0) return '';

  const rows = badgeItems.map(item => {
    const contrastText = getContrastText(item.color);
    const paramsStr = Object.entries(item.params)
      .filter(([, v]) => v !== '' && v !== undefined && v !== null)
      .map(([k, v]) => `<b>${k}</b>: ${v}`)
      .join(', ');
    return `<tr style="border-bottom:1px solid #eee;">
      <td style="padding:6px 10px;"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${item.color};color:${contrastText};text-align:center;line-height:22px;font-weight:bold;font-size:11px;">${item.badgeNum}</span></td>
      <td style="padding:6px 10px;">${item.type}</td>
      <td style="padding:6px 10px;font-weight:500;">${item.name}</td>
      <td style="padding:6px 10px;">${paramsStr}</td>
    </tr>`;
  }).join('\n    ');

  return `<table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px;">
  <thead>
    <tr style="background:#f5f5f5;border-bottom:2px solid #ddd;">
      <th style="padding:6px 10px;text-align:left;width:40px;">#</th>
      <th style="padding:6px 10px;text-align:left;width:80px;">Type</th>
      <th style="padding:6px 10px;text-align:left;">Name</th>
      <th style="padding:6px 10px;text-align:left;">Parameters</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`;
};

const addBadgeLabelsToScene = (excalidrawAPI, badgeItems) => {
  if (!badgeItems.length) return [];
  const elements = excalidrawAPI.getSceneElements();
  const newElements = [];

  badgeItems.forEach(item => {
    const fullLabel = `${item.badgeNum}. ${item.name}`;
    const fullTextWidth = fullLabel.length * 8;
    const fullRectWidth = fullTextWidth + 12;
    // Use just the number if full label is wider than the element bounds
    const useShort = item.boundsW > 0 && fullRectWidth > item.boundsW;
    const label = useShort ? `${item.badgeNum}` : fullLabel;
    const textWidth = label.length * 8;
    const rectWidth = useShort ? 24 : fullTextWidth + 12;
    const rectHeight = useShort ? 24 : 22;
    const contrastText = getContrastText(item.color);
    const ts = Date.now();

    // Position above the element's true top edge, centered horizontally
    const badgeX = item.centroidX - rectWidth / 2;
    const badgeY = item.topY - rectHeight - 6;

    const rect = {
      type: 'rectangle',
      version: 1,
      versionNonce: ts + item.badgeNum * 2,
      isDeleted: false,
      id: `_badge-rect-${item.badgeNum}-${ts}`,
      fillStyle: 'solid',
      strokeWidth: 0,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 90,
      angle: 0,
      x: badgeX,
      y: badgeY,
      width: rectWidth,
      height: rectHeight,
      seed: ts + item.badgeNum * 2,
      groupIds: [],
      backgroundColor: item.color,
      strokeColor: 'transparent',
      boundElements: null,
      customData: { _badge: true },
      frameId: null,
      link: null,
      locked: true,
      roundness: useShort ? { type: 3 } : { type: 3 },
      updated: ts,
    };

    const text = {
      type: 'text',
      version: 1,
      versionNonce: ts + item.badgeNum * 2 + 1,
      isDeleted: false,
      id: `_badge-text-${item.badgeNum}-${ts}`,
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      angle: 0,
      x: useShort ? badgeX + (rectWidth - textWidth) / 2 : badgeX + 6,
      y: badgeY + (useShort ? 3 : 2),
      width: textWidth,
      height: 18,
      seed: ts + item.badgeNum * 2 + 1,
      groupIds: [],
      backgroundColor: 'transparent',
      strokeColor: contrastText,
      boundElements: null,
      customData: { _badge: true },
      frameId: null,
      link: null,
      locked: true,
      roundness: null,
      text: label,
      fontSize: 14,
      fontFamily: 1,
      textAlign: useShort ? 'center' : 'left',
      verticalAlign: 'top',
      baseline: 14,
      containerId: null,
      originalText: label,
      autoResize: true,
      lineHeight: 1.25,
      updated: ts,
    };

    newElements.push(rect, text);
  });

  excalidrawAPI.updateScene({
    elements: [...elements, ...newElements],
  });

  return newElements.map(el => el.id);
};

const removeBadgeLabels = (excalidrawAPI) => {
  const elements = excalidrawAPI.getSceneElements().map(el => {
    if (el.customData?._badge) {
      return { ...el, isDeleted: true };
    }
    return el;
  });
  excalidrawAPI.updateScene({ elements });
};

export const App = forwardRef((props, ref) => {
  const [params, setParams] = useState({});
  const [index, setIndex] = useState(0);
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const [drawingsSidebar, setDrawingsSidebar] = useState(true);
  const [treatmentSidebar, setTreatmentSidebar] = useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [selectedTreatment, setSelectedTreatment] = useState('')
  const [newElement, setNewElement] = useState('')
  const [selectedElement, setSelectedElement] = useState('')
  const [variables, setVariables] = useState({})
  const [images, setImages] = useState({male:[], female:[]});
  const [treatments, setTreatments] = useState([]);
  const [annotationHistory, setAnnotationHistory] = useState([]);
  const [annotationsTemplate, setAnnotationsTemplate] = useState('');
  const [templateParts, setTemplateParts] = useState([]);
  const [partValues, setPartValues] = useState({});
  const [selectedPart, setSelectedPart] = useState(null);
  const [partsVisible, setPartsVisible] = useState(true);
  const partElementSnapshotsRef = useRef({});  // id -> { x, y, points, width, height, angle }

  const storePartSnapshots = (elements) => {
    elements.forEach(el => {
      if (el.customData?.partType === 'template_part') {
        partElementSnapshotsRef.current[el.id] = {
          x: el.x, y: el.y, points: el.points,
          width: el.width, height: el.height, angle: el.angle,
        };
      }
    });
  };

  const getPartStyle = (partName, isSelected) => {
    const part = templateParts.find(p => p.part_name === partName);
    const color = part?.color || '#4dabf7';
    const hasValues = partValues[partName] &&
      Object.values(partValues[partName]).some(v => v !== '');
    if (isSelected) {
      return { strokeWidth: 3, strokeStyle: 'solid', backgroundColor: hexWithAlpha(color, 0.45), strokeColor: color, opacity: 100 };
    }
    if (hasValues) {
      return { strokeWidth: 2, strokeStyle: 'solid', backgroundColor: hexWithAlpha(color, 0.35), strokeColor: color, opacity: 100 };
    }
    return { strokeWidth: 1, strokeStyle: 'dashed', backgroundColor: hexWithAlpha(color, 0.08), strokeColor: color + '99', opacity: 100 };
  };

  const updatePartVisuals = (selectedPartName) => {
    if (!excalidrawAPI) return;
    const sceneElements = excalidrawAPI.getSceneElements().map(el => {
      if (el.customData?.partType === 'template_part') {
        const isSelected = el.customData.partName === selectedPartName;
        const snap = partElementSnapshotsRef.current[el.id];
        return { ...el, ...getPartStyle(el.customData.partName, isSelected), ...(snap || {}) };
      }
      return el;
    });
    excalidrawAPI.updateScene({ elements: sceneElements });
  };

  const resetPartVisuals = () => {
    if (!excalidrawAPI) return;
    const sceneElements = excalidrawAPI.getSceneElements().map(el => {
      if (el.customData?.partType === 'template_part') {
        const snap = partElementSnapshotsRef.current[el.id];
        return { ...el, ...getPartStyle(el.customData.partName, false), ...(snap || {}) };
      }
      return el;
    });
    excalidrawAPI.updateScene({ elements: sceneElements });
  };

  useImperativeHandle(ref, () => ({
    handleSave,
  }));

  useEffect(() => {
    // Get the current URL parameters
    const searchParams = new URLSearchParams(window.location.search);
    
    // Convert URLSearchParams to an object
    const paramsObj = {};
    for (let [key, value] of searchParams.entries()) {
      paramsObj[key] = value;
    }
    
    setParams(paramsObj);

    if(paramsObj.doctype && paramsObj.docname){
      frappe.call({
        method: "annotation.api.get_annotation_history",
        args: { doctype: paramsObj.doctype, docname: paramsObj.docname },
        callback: function(r) {
          setAnnotationHistory(r.message.map(value => {
            value.data = JSON.parse(value.json)
            return value
          }))
        }
      });
    }
    else if(paramsObj.annotation_name){
      // frappe.db.get_doc('Health Annotation', paramsObj.annotation_name)
      // .then(doc => {
      //   doc.data = JSON.parse(doc.json)
      // })
    }
    else{
      frappe.throw('Please open the annotation from an encounter or a procedure!')
    }

    frappe.call({
      method: "annotation.api.annotations_records",
      callback: function(r) {
        let vars = {}
        r.message.treatments.forEach(treatment => {
          vars[treatment.treatment] = {}
          treatment.variables.forEach(value => {
            vars[treatment.treatment][value.variable_name] = ''
          })
        })
        setVariables(vars)
        setTreatments(r.message.treatments)
        setImages({
          male: r.message.templates.filter(doc => doc.gender === 'Male'),
          female: r.message.templates.filter(doc => doc.gender === 'Female'),
        })
      }
    });
  }, []);

  useEffect(() => {
    if(params.annotation_name && (images.male.length > 0 || images.female.length > 0)){
      frappe.db.exists('Health Annotation', params.annotation_name)
      .then(exists => {
        if(exists){
          frappe.db.get_doc('Health Annotation', params.annotation_name)
          .then(doc => {
            doc.data = JSON.parse(doc.json)
            importAnnotation(doc)
          })
        }
      })
    }

    const handleKeyDown = (event) => {
      if (event.ctrlKey && event.key === "s") {
        event.preventDefault(); // Prevent the default save action
        handleSave();
      }
    };

    // Add event listener for keyboard shortcuts
    document.addEventListener("keydown", handleKeyDown);

    // Clean up the event listener on unmount
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };

  }, [excalidrawAPI, annotationsTemplate, images]);

  const handleSave = async () => {
    if (!params.doctype && !params.docname) return;
    if (!excalidrawAPI) {
      frappe.throw("Excalidraw API not available!");
      return;
    }
    const elements = excalidrawAPI.getSceneElements();
    if (!elements || !elements.length) {
      frappe.throw("Excalidraw Elements not available!");
      return;
    }

    // Collect badge items
    const badgeItems = collectBadgeItems(elements, partValues, templateParts, treatments);
    const hasAnyData = badgeItems.length > 0;

    const dialog = new frappe.ui.Dialog({
      title: 'Save Annotation',
      fields: [
        ...(hasAnyData ? [] : [{
          fieldtype: 'HTML',
          options: '<div style="color:#d68a00;margin-bottom:10px;"><strong>\u26A0 No annotation parameters filled.</strong> The annotation will be saved without data.</div>'
        }]),
        {
          fieldname: 'include_badges',
          fieldtype: 'Check',
          label: 'Include badges on image',
          default: 1,
          hidden: !hasAnyData,
        }
      ],
      primary_action_label: 'Save',
      primary_action: async (values) => {
        dialog.hide();
        await executeSave(elements, badgeItems, values.include_badges && hasAnyData);
      }
    });
    dialog.show();
  };

  const executeSave = async (elements, badgeItems, includeBadges) => {
    // Add badge labels to scene before export
    if (includeBadges) {
      addBadgeLabelsToScene(excalidrawAPI, badgeItems);
    }

    // Export as Blob (now includes badges if added)
    const blob = await exportToBlob({
      elements: excalidrawAPI.getSceneElements(),
      appState: excalidrawAPI.getAppState(),
      files: excalidrawAPI.getFiles(),
      mimeType: 'image/jpeg'
    });

    // Remove badge labels immediately after export
    if (includeBadges) {
      removeBadgeLabels(excalidrawAPI);
    }

    // Strip Base64 image data, template part polygons, and badge elements
    const strippedElements = elements.map(el => {
      if (el.type === 'image') {
        const { dataURL, ...rest } = el;
        return rest;
      }
      return el;
    }).filter(el => !(el.customData?.partType === 'template_part'))
      .filter(el => !(el.customData?._badge));

    const hasPartValues = Object.values(partValues).some(pv =>
      pv && Object.values(pv).some(v => v !== '')
    );
    const annotationType = hasPartValues ? 'Template Parts' : 'Free Drawing';

    const jsonText = JSON.stringify({
      elements: strippedElements,
      partValues: partValues,
    });

    const base64Image = await convertBlobToBase64(blob);

    // Generate HTML data table
    const annotationData = generateAnnotationDataHTML(badgeItems);

    frappe.call({
      method: "annotation.api.save_annotation",
      args: {
        doctype: params.doctype,
        docname: params.docname,
        annotation_name: params.annotation_name,
        annotation_template: annotationsTemplate,
        json_text: jsonText,
        file_data: base64Image,
        annotation_type: annotationType,
        annotation_data: annotationData,
      },
      callback: function (response) {
        frappe.msgprint({ title: 'Saved', message: 'Annotation saved successfully!', indicator: 'green' });
        setTimeout(() => {
          window.location.href = frappe.utils.get_form_link(params.doctype, params.docname);
        }, 1000);
      },
    });
  };

  const updateElementCustomData = (target, newVars) => {
    const sceneElements = excalidrawAPI.getSceneElements().map(element => {
      if(element.id === target.id){
        if(newVars)
          element.customData = newVars
        else
          element.customData = {...variables[selectedTreatment], type: selectedTreatment}
      }
      return element
    })
  
    excalidrawAPI.updateScene({
      elements: sceneElements
    })
  }

  const handleExcaliChange = (elements, appState) => {
    const newElements = appState.editingElement
    const cursorButton = appState.cursorButton
    if(treatmentSidebar && selectedTreatment && appState.activeTool.type !== 'freedraw' && appState.activeTool.type !== 'selection' && !selectedElement){
      setSelectedTreatment('')
      excalidrawAPI.toggleSidebar({name: 'drawings'})
    }
    if (newElements && newElements.type === 'freedraw') {
      setNewElement(newElements)
    }
    if (newElement && cursorButton === 'up' && excalidrawAPI) {
      updateElementCustomData(newElement)    
      setNewElement(null)
    }
  };

  // Point-in-polygon test for locked part elements
  const findPartAtPoint = (sceneX, sceneY) => {
    if (!excalidrawAPI) return null;
    const elements = excalidrawAPI.getSceneElements();
    // Iterate in reverse so topmost element wins
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.isDeleted || el.customData?.partType !== 'template_part') continue;
      // Convert scene coords to element-local coords and run ray-casting
      const pts = el.points;
      if (!pts || pts.length < 3) continue;
      const localX = sceneX - el.x;
      const localY = sceneY - el.y;
      let inside = false;
      for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        const [ax, ay] = pts[a];
        const [bx, by] = pts[b];
        if ((ay > localY) !== (by > localY) && localX < (bx - ax) * (localY - ay) / (by - ay) + ax) {
          inside = !inside;
        }
      }
      if (inside) return el.customData;
    }
    return null;
  };

  const handleExcaliPointerDown = (activeTool, pointerDownState) => {
    const thisElement = pointerDownState.hit.element;
    if (thisElement && thisElement.type === 'freedraw') {
      setVariables({...variables, [thisElement.customData.type]: thisElement.customData})
      setSelectedElement(thisElement)
      setSelectedTreatment(thisElement.customData.type)
      setSelectedPart(null)
    }
    else {
      // Check if click hit a locked part polygon (only when visible)
      const origin = pointerDownState.origin;
      const hitPart = partsVisible ? findPartAtPoint(origin.x, origin.y) : null;
      if (hitPart) {
        setSelectedPart(hitPart);
        setSelectedElement('');
        setSelectedTreatment('');
        updatePartVisuals(hitPart.partName);
      } else if (activeTool.type === 'selection') {
        setSelectedElement('');
        setSelectedTreatment('');
        if (selectedPart) {
          setSelectedPart(null);
          resetPartVisuals();
        }
      }
    }
  };

  const handleDrawModeClick = (treatment) => {
    if (!excalidrawAPI) return;

    setSelectedTreatment(treatment.treatment);
    excalidrawAPI.updateScene({
      appState: {
        ...excalidrawAPI.getAppState(),
        activeTool: {
          type: "freedraw",
        },
        currentItemStrokeColor: treatment.color, // Set your desired stroke color here
      },
      commitToHistory: true,
    });
    // excalidrawAPI.scrollToContent()
    // excalidrawAPI.refresh()
  };

  const importAnnotation = (annotation) => {
    if (!excalidrawAPI) return;
    
    // Old format (has files embedded) — load directly for backward compatibility
    if (annotation.data.files && Object.keys(annotation.data.files).length > 0) {
      setTemplateParts([]);
      setPartValues({});
      setSelectedPart(null);
      for (const [key, value] of Object.entries(annotation.data.files)) {
        excalidrawAPI.addFiles([value]);
      }
      excalidrawAPI.updateScene(annotation.data);
      excalidrawAPI.scrollToContent();
      excalidrawAPI.refresh();
      setHistoryOpen(false);
      return;
    }

    // New format (no files) — reconstruct template image from Annotation Template
    const templateName = annotation.annotation_template;
    if (!templateName) {
      setTemplateParts([]);
      setPartValues({});
      setSelectedPart(null);
      excalidrawAPI.updateScene(annotation.data);
      excalidrawAPI.scrollToContent();
      excalidrawAPI.refresh();
      setHistoryOpen(false);
      return;
    }

    setAnnotationsTemplate(templateName);

    // Find the template in our loaded images
    const allTemplates = [...images.male, ...images.female];
    const template = allTemplates.find(t => t.name === templateName);
    
    if (!template) {
      excalidrawAPI.updateScene(annotation.data);
      excalidrawAPI.scrollToContent();
      excalidrawAPI.refresh();
      setHistoryOpen(false);
      return;
    }

    // Check if saved data has an image element with positioning info
    const savedImageElement = annotation.data.elements.find(el => el.type === 'image');

    const image = new Image();
    image.src = template.image;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);

      const dataURL = canvas.toDataURL('image/jpeg');

      if (savedImageElement) {
        // Saved image element has exact positioning — just regenerate the file data
        const fileId = savedImageElement.fileId || template.id || generateFileId(template);

        // Restore the image element and load the full scene first
        const restoredElements = annotation.data.elements.map(el => {
          if (el.type === 'image') {
            return { ...el, fileId: fileId, status: 'pending' };
          }
          return el;
        });

        // Reconstruct part overlays
        const parts = template.parts || [];
        setTemplateParts(parts);
        const loadedPartValues = annotation.data.partValues || {};
        setPartValues(loadedPartValues);
        setSelectedPart(null);

        const imgScale = savedImageElement.scale ? savedImageElement.scale[0] : 1;
        const partElements = createPartElements(parts, imgScale, savedImageElement.x, savedImageElement.y, savedImageElement.width, savedImageElement.height, loadedPartValues);
        storePartSnapshots(partElements);

        excalidrawAPI.updateScene({
          elements: [...restoredElements, ...partElements],
          commitToHistory: true,
        });

        // Then add files — elements are now in the scene so Excalidraw can cache them
        excalidrawAPI.addFiles([{
          mimeType: 'image/jpeg',
          id: fileId,
          dataURL: dataURL,
          created: Date.now(),
        }]);
      } else {
        // Old patched data (no image element) — reconstruct from canvas dimensions
        const canvasContainer = document.querySelector('.excalidraw__canvas');
        if (!canvasContainer) {
          excalidrawAPI.updateScene(annotation.data);
          excalidrawAPI.scrollToContent();
          excalidrawAPI.refresh();
          setHistoryOpen(false);
          return;
        }
        const canvasHeight = canvasContainer.clientHeight;
        const canvasWidth = canvasContainer.clientWidth;

        const fileId = template.id || generateFileId(template);

        const scaleFactor = canvasHeight / image.height;
        const imageX = (canvasWidth - image.width * scaleFactor) / 2;
        const imageY = (canvasHeight - canvasHeight) / 2;

        const imageElement = {
          type: 'image',
          version: 1,
          versionNonce: 123456,
          isDeleted: false,
          id: template.label,
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          angle: 0,
          x: imageX,
          y: imageY,
          width: image.width * scaleFactor,
          height: image.height * scaleFactor,
          seed: 1,
          groupIds: [],
          status: 'pending',
          backgroundColor: 'transparent',
          strokeColor: 'transparent',
          boundElements: null,
          customData: undefined,
          fileId: fileId,
          frameId: null,
          link: null,
          locked: true,
          roundness: null,
          scale: [1, 1],
          updated: Date.now(),
        };

        // Reconstruct part overlays for old format
        const oldParts = template.parts || [];
        setTemplateParts(oldParts);
        const oldPartValues = annotation.data.partValues || {};
        setPartValues(oldPartValues);
        setSelectedPart(null);

        const oldPartElements = createPartElements(oldParts, scaleFactor, imageX, imageY, image.width, image.height, oldPartValues);
        storePartSnapshots(oldPartElements);

        // Add elements to scene first
        excalidrawAPI.updateScene({
          elements: [imageElement, ...oldPartElements, ...annotation.data.elements],
          commitToHistory: true,
        });

        // Then add files — elements are now in the scene so Excalidraw can cache them
        excalidrawAPI.addFiles([{
          mimeType: 'image/jpeg',
          id: fileId,
          dataURL: dataURL,
          created: Date.now(),
        }]);
      }

      // Delay to let Excalidraw process the added files before rendering
      setTimeout(() => {
        excalidrawAPI.scrollToContent();
        excalidrawAPI.refresh();
        setHistoryOpen(false);
      }, 100);
    };

    image.onerror = () => {
      excalidrawAPI.updateScene(annotation.data);
      excalidrawAPI.scrollToContent();
      excalidrawAPI.refresh();
      setHistoryOpen(false);
    };
  };

  const handleImageClick = async (img, array, gender) => {
    if (!excalidrawAPI) return;

    const canvasContainer = document.querySelector('.excalidraw__canvas'); // Assuming Excalidraw canvas has this class
    const canvasHeight = canvasContainer.clientHeight;
    const canvasWidth = canvasContainer.clientWidth;
    setAnnotationsTemplate(img.name)
    const image = new Image();
    image.src = img.image;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width; // Set canvas width to image width
      canvas.height = image.height; // Set canvas height to image height
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
  
      const dataURL = canvas.toDataURL('image/jpeg'); // Ensure the data URL is in JPEG format  
      let fileId = img.id;
      if (!img.id) { // Check if fileId exists
        fileId = generateFileId(img); // Generate a unique fileId
        if(array){
          const newArray = array.map(val => {
            if (val.image === img.image) val.id = fileId;
            return val;
          });

          setImages({ ...images, [gender]: newArray });
        }
      }

      const scaleFactor = canvasHeight / image.height;
      const imageWidth = image.width * scaleFactor;
      const imageHeight = canvasHeight;
      const imageX = (canvasWidth - imageWidth) / 2;
      const imageY = (canvasHeight - imageHeight) / 2;
  
      const imageElement = {
        type: 'image',
        version: 1,
        versionNonce: 123456,
        isDeleted: false,
        id: img.label,
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        angle: 0,
        x: imageX,
        y: imageY,
        width: image.width * scaleFactor,
        height: image.height * scaleFactor,
        seed: 1,
        groupIds: [],
        status: 'pending',
        backgroundColor: 'transparent',
        strokeColor: 'transparent',
        boundElements: null,
        customData: undefined,
        fileId: fileId,
        frameId: null,
        link: null,
        locked: true,
        roundness: null,
        scale: [1, 1],
        updated: Date.now(),
      };
  
      // Set up template parts
      const parts = img.parts || [];
      setTemplateParts(parts);
      setPartValues({});
      setSelectedPart(null);

      const partElements = createPartElements(parts, scaleFactor, imageX, imageY, image.width, image.height);
      storePartSnapshots(partElements);

      // Add elements to scene first
      excalidrawAPI.updateScene({
        elements: [imageElement, ...partElements],
        commitToHistory: true,
      });

      // Then add files — elements are now in the scene so Excalidraw can cache them
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
  
    image.onerror = (error) => {
      frappe.throw('Failed to load image:', error);
    };
  };

  return (
    <div style={{ height: 'calc(100vh - 113px)' }}>
      <div className={'excalidraw-wrapper ' + (selectedTreatment ? 'leftdrawer-open' : '')} style={{ height: '100%', position: 'relative'}}>
        {selectedTreatment && <Card variant='soft' sx={{ width: 240, zIndex: 10, marginTop: '40px', height: 'fit-content', position: 'absolute'}}>
          {treatments.find(treatment => treatment.treatment == selectedTreatment).variables.map((variable, index) => {
            if(variable.type === 'Select'){
              let optionsArray = variable.options.split('\n')
              variable.selectOptions = optionsArray.map(option => {return {label: option, value: option}})
            }
            return <div key={index}>
              <FormLabel>{variable.variable_name}</FormLabel>
              {variable.type === 'Select' ? 
                <Select 
                name={variable.variable_name}
                isClearable
                value={variable.selectOptions.find(option => option.value === variables[selectedTreatment][variable.variable_name]) || ''}
                onChange={(selectedOption) => {
                  const newVars = {
                    ...variables[selectedTreatment],
                    [variable.variable_name]: selectedOption ? selectedOption.value : ''
                  }
                  setVariables({...variables, [selectedTreatment]: newVars});
                  if(selectedElement)
                    updateElementCustomData(selectedElement, newVars)
                }}
                options={variable.selectOptions}
                />
              : variable.type === 'Data' ? <Input value={variables[selectedTreatment][variable.variable_name]} onChange={event => {
                const newVars = {
                  ...variables[selectedTreatment],
                  [variable.variable_name]: event.target.value
                }
                setVariables({...variables, [selectedTreatment]: newVars});
                if(selectedElement)
                  updateElementCustomData(selectedElement, newVars)
              }}/> 
              : <></>}
            </div>
          })}
        </Card>}
        {selectedPart && <Card variant='soft' sx={{ width: 260, zIndex: 10, marginTop: '40px', height: 'fit-content', position: 'absolute', right: 10, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          <FormLabel sx={{ fontWeight: 'bold', fontSize: '16px', mb: 1 }}>{selectedPart.partName}</FormLabel>
          {templateParts.find(p => p.part_name === selectedPart.partName)?.variables?.map((variable, vIdx) => {
            if (variable.type === 'Select') {
              variable.selectOptions = (variable.options || '').split('\n').filter(Boolean).map(option => ({ label: option, value: option }));
            }
            const currentValue = (partValues[selectedPart.partName] || {})[variable.variable_name] || '';
            return (
              <div key={vIdx} style={{ marginBottom: 8 }}>
                <FormLabel>{variable.variable_name}</FormLabel>
                {variable.type === 'Select' ? (
                  <Select
                    name={variable.variable_name}
                    isClearable
                    value={variable.selectOptions?.find(option => option.value === currentValue) || null}
                    onChange={(selectedOption) => {
                      setPartValues(prev => ({
                        ...prev,
                        [selectedPart.partName]: {
                          ...(prev[selectedPart.partName] || {}),
                          [variable.variable_name]: selectedOption ? selectedOption.value : ''
                        }
                      }));
                    }}
                    options={variable.selectOptions || []}
                  />
                ) : variable.type === 'Data' ? (
                  <Input
                    value={currentValue}
                    onChange={event => {
                      setPartValues(prev => ({
                        ...prev,
                        [selectedPart.partName]: {
                          ...(prev[selectedPart.partName] || {}),
                          [variable.variable_name]: event.target.value
                        }
                      }));
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </Card>}
        <Excalidraw
        UIOptions={{ canvasActions: { saveToActiveFile: false } }}
        onChange={handleExcaliChange}
        onPointerDown={handleExcaliPointerDown}
        excalidrawAPI={(api)=> setExcalidrawAPI(api)}
        initialData={{
          elements: [],
          appState: {
            openSidebar: { name: 'drawings' },
          },
          scrollToContent: true
        }}
        renderTopRightUI={() => { 
          return (
            <>
              {!drawingsSidebar && <Button name="drawings" variant="soft" onClick={() => {excalidrawAPI.toggleSidebar({name: 'drawings'})}}>
                Drawings
              </Button>}
              {!treatmentSidebar && <Button 
              name="treatments" 
              color="success" 
              variant="soft" 
              onClick={() => {excalidrawAPI.toggleSidebar({name: 'treatments'})}}
              >
                Treatments
              </Button>}
              {templateParts.length > 0 && <Button
                variant="soft"
                color={partsVisible ? 'primary' : 'neutral'}
                onClick={() => {
                  const newVisible = !partsVisible;
                  setPartsVisible(newVisible);
                  if (!newVisible) {
                    setSelectedPart(null);
                  }
                  const elements = excalidrawAPI.getSceneElements().map(el => {
                    if (el.customData?.partType === 'template_part') {
                      return { ...el, opacity: newVisible ? 100 : 0 };
                    }
                    return el;
                  });
                  excalidrawAPI.updateScene({ elements });
                }}
              >
                {partsVisible ? 'Hide Areas' : 'Show Areas'}
              </Button>}
            </>
          );
        }}
        >
          <Sidebar name="drawings" className='drawings-sidebar' docked onStateChange={setDrawingsSidebar}>
            <Sidebar.Tabs>
              <Tabs
                value={index}
                onChange={(event, value) => setIndex(value)}
                sx={(theme) => ({
                  m: 1,
                  borderRadius: 16,
                  height: '100%',
                  boxShadow: theme.shadow.md,
                  
                  [`& .${tabClasses.root}`]: {
                    py: 1,
                    flex: 1,
                    transition: '0.3s',
                    fontWeight: 'md',
                    fontSize: 'md',
                    [`&:not(.${tabClasses.selected}):not(:hover)`]: {
                      opacity: 0.7,
                    },
                  },
                })}
              >
                <TabList
                  variant="plain"
                  size="sm"
                  disableUnderline
                  sx={{ borderRadius: 'xl', p: 2 }}
                >
                  <Tab
                    disableIndicator
                    {...(index === 0 && { color: 'primary' })}
                  >
                    Male
                  </Tab>
                  <Tab
                    disableIndicator
                    {...(index === 1 && { color: 'danger' })}
                  >
                    Female
                  </Tab>
                </TabList>
                <TabPanel value={0} sx={{ p: 0 }}>
                  <div>
                    <List style={{height: 'calc(100vh - 175px)',overflowY: 'auto'}}>
                      {images.male.map((img, index, array) => (
                        <ListItemButton key={img.label} onClick={() => {handleImageClick(img, array, 'male')}}>
                          <ListItemDecorator>
                            <img src={img.image} alt={img.label} style={{ width: '50px', height: '50px', marginRight: '15px' }} />
                          </ListItemDecorator>
                          {img.label}
                        </ListItemButton>
                      ))}
                    </List>
                  </div>
                </TabPanel>
                <TabPanel value={1} sx={{ p: 0 }}>
                  <div>
                    <List>
                      {images.female.map((img, index, array) => (
                        <ListItemButton key={img.label} onClick={() => {handleImageClick(img, array, 'female')}}>
                          <ListItemDecorator>
                            <img src={img.image} alt={img.label} style={{ width: '50px', height: '50px', marginRight: '15px' }} />
                          </ListItemDecorator>
                          {img.label}
                        </ListItemButton>
                      ))}
                    </List>
                  </div>
                </TabPanel>
              </Tabs>
            </Sidebar.Tabs>
          </Sidebar>

          <Sidebar name="treatments" className='treatments-sidebar' docked onStateChange={setTreatmentSidebar}>
            <RadioGroup
            overlay
            name="treatments"
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              flexDirection: 'row',
              padding: '1rem',
              gap: 2,
              [`& .${radioClasses.checked}`]: {
                [`& .${radioClasses.action}`]: {
                  inset: -1,
                  border: '3px solid',
                  borderColor: 'primary.500',
                },
              },
              [`& .${radioClasses.radio}`]: {
                display: 'contents',
                '& > svg': {
                  zIndex: 2,
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  bgcolor: 'background.surface',
                  borderRadius: '50%',
                },
              },
            }}
            >
              {treatments.map((value, index) => (
                <Sheet
                  key={index}
                  variant="outlined"
                  sx={{
                    borderRadius: 'md',
                    boxShadow: 'sm',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 2,
                    minWidth: 120,
                  }}
                  onClick={() => {handleDrawModeClick(value)}}
                >
                  <Badge sx={{
                    marginRight: 'auto',
                    ['& .MuiBadge-badge']: {
                      backgroundColor: value.color
                    }
                  }}>
                  </Badge>
                  <Radio id={value.treatment} value={value.treatment} checkedIcon={<CheckCircleRoundedIcon />}/>
                  {value.treatment}
                </Sheet>
              ))}
            </RadioGroup>
          </Sidebar>

          <Footer>
            <Button color="neutral" onClick={() => setHistoryOpen(true)}>
              History
            </Button>
            <Drawer
              size="md"
              variant="plain"
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              slotProps={{
                root: { sx: { zIndex: 3000 } },
                content: {
                  sx: {
                    bgcolor: 'transparent',
                    p: { md: 3, sm: 0 },
                    boxShadow: 'none'
                  },
                },
              }}
            >
              <Sheet
                sx={{
                  borderRadius: 'md',
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  height: '100%',
                  overflow: 'auto',
                }}
              >
                <DialogTitle>History</DialogTitle>
                <ModalClose />
                <Divider sx={{ mt: 'auto' }} />
                <DialogContent sx={{ gap: 2 }}>
                  <List style={{height: 'calc(100vh - 175px)',overflowY: 'auto'}}>
                    {annotationHistory.map((value, index, array) => (
                      <ListItemButton key={index} onClick={() => {importAnnotation(value)}}>
                        <ListItemDecorator>
                          <img src={value.image} alt={value.name} style={{ width: '50px', height: '50px', marginRight: '15px' }} />
                        </ListItemDecorator>
                        {formatDate(value.creation)}
                      </ListItemButton>
                    ))}
                  </List>
                </DialogContent>

                {/* <Divider sx={{ mt: 'auto' }} />
                <Stack
                  direction="row"
                  useFlexGap
                  spacing={1}
                  sx={{ justifyContent: 'space-between' }}
                >
                  <Button onClick={() => setHistoryOpen(false)}>Show 165 properties</Button>
                </Stack> */}
              </Sheet>
            </Drawer>
          </Footer>
        </Excalidraw>
      </div>
    </div>
  );
});
