// zoomActions — viewport zoom/pan actions for a board (§M1-01 extraction).
import { resetZoom, zoomAt } from '$lib/canvas/Camera';
import type { CameraState } from '$lib/canvas/Camera';
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import { fitCameraToObjects } from './boardInteractions';

export interface ZoomActionsHost {
	getEngine: () => CanvasEngine | null;
	getCamera: () => CameraState;
	setCamera: (camera: CameraState) => void;
	getView: () => { width: number; height: number };
	onDirty: () => void;
}

export function createZoomActions(host: ZoomActionsHost) {
	function zoomIn() {
		const view = host.getView();
		host.setCamera(zoomAt(host.getCamera(), view.width / 2, view.height / 2, 1.25));
		host.onDirty();
	}

	function zoomOut() {
		const view = host.getView();
		host.setCamera(zoomAt(host.getCamera(), view.width / 2, view.height / 2, 0.8));
		host.onDirty();
	}

	function zoomReset() {
		const view = host.getView();
		host.setCamera(resetZoom(host.getCamera(), view.width, view.height));
		host.onDirty();
	}

	function zoomFit() {
		const objects = host.getEngine()?.store.toJSON() ?? [];
		const next = fitCameraToObjects(objects, host.getView());
		if (next) host.setCamera(next);
		else zoomReset();
		host.onDirty();
	}

	return { zoomIn, zoomOut, zoomReset, zoomFit };
}
