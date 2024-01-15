/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import UIComponent from '/scripts/components/UIComponent.js';
import UpdateHandler from '/scripts/handlers/UpdateHandler.js';
import { capitalizeFirstLetter, numberOr } from '/scripts/utils.js';
import * as THREE from 'three';

const DEFAULT_MATERIAL = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
});

const DEFAULT_GLASSMORPHISM_MATERIAL = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.99,
    roughness: 0.45,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
});

const DEFAULT_BORDER_MATERIAL = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
});

class LayoutComponent extends UIComponent {
    constructor(...styles) {
        super(...styles);
        this._defaults['alignItems'] = 'center';
        this._defaults['backgroundVisible'] = false;
        this._defaults['borderMaterial'] = DEFAULT_BORDER_MATERIAL.clone();
        this._defaults['borderRadius'] = 0;
        this._defaults['borderWidth'] = 0;
        this._defaults['contentDirection'] = 'column';
        this._defaults['justifyContent'] = 'start';
        this._defaults['material'] = this.glassmorphism
            ? DEFAULT_GLASSMORPHISM_MATERIAL.clone()
            : DEFAULT_MATERIAL.clone();
        this._defaults['height'] = 'auto';
        this._defaults['overflow'] = 'visible';
        this._defaults['width'] = 'auto';
        this.computedHeight = 0;
        this.marginedHeight = 0;
        this.unpaddedHeight = 0;
        this.computedWidth = 0;
        this.marginedWidth = 0;
        this.unpaddedWidth = 0;
        this._materialOffset = 0;
        this._content = new THREE.Object3D();
        this.add(this._content);
        this.position.z = 0.00000001;
        if(this.overflow != 'visible') this._createClippingPlanes();
    }

    _handleStyleUpdateForBackgroundVisibility() {
        if(!this._background) return;
        this._background.visible = this.backgroundVisible || false;
    }

    _handleStyleUpdateForMargin() {
        this.updateLayout();
    }

    _handleStyleUpdateForPadding() {
        this.updateLayout();
    }

    _handleStyleUpdateForHeight() {
        this.updateLayout();
    }

    _handleStyleUpdateForWidth() {
        this.updateLayout();
    }

    _handleStyleUpdateForMaterial() {
        let material = this.material;
        material.polygonOffset = true;
        material.polygonOffsetFactor = material.polygonOffsetUnits
            = -1 * this._materialOffset;
        this._background.material = material;
    }

    _handleStyleUpdateForMaterialColor() {
        let materialColor = this.materialColor;
        if(materialColor == null) materialColor = '#ffffff';
        this.material.color.set(materialColor);
    }

    _handleStyleUpdateForOverflow() {
        if(this.overflow != 'visible') {
            if(!this.clippingPlanes) this._createClippingPlanes();
        } else if(this.clippingPlanes) {
            this._clearClippingPlanes();
        }
    }

    _createBackground() {
        if(this._background) this.remove(this._background);
        if(this._border) this.remove(this._border);
        this._background = null;
        this._border = null;
        let material = this.material;
        let materialColor = this.materialColor;
        if(materialColor) material.color.set(materialColor);
        let borderWidth = this.borderWidth || 0;
        let borderRadius = this.borderRadius || 0;
        let topLeftRadius = numberOr(this.borderTopLeftRadius, borderRadius);
        let topRightRadius = numberOr(this.borderTopRightRadius, borderRadius);
        let bottomLeftRadius = numberOr(this.borderBottomLeftRadius,
            borderRadius);
        let bottomRightRadius = numberOr(this.borderBottomRightRadius,
            borderRadius);
        let height = this.computedHeight;
        let width = this.computedWidth;
        let renderOrder = 100 + this._materialOffset;
        if(borderWidth) {
            let borderShape = createShape(width, height, topLeftRadius,
                topRightRadius, bottomLeftRadius, bottomRightRadius);
            topLeftRadius = Math.max(topLeftRadius - borderWidth, 0);
            topRightRadius = Math.max(topRightRadius - borderWidth, 0);
            bottomLeftRadius = Math.max(bottomLeftRadius - borderWidth, 0);
            bottomRightRadius = Math.max(bottomRightRadius - borderWidth, 0);
            height -= 2 * borderWidth;
            width -= 2 * borderWidth;
            let shape = createShape(width, height, topLeftRadius,
                topRightRadius, bottomLeftRadius, bottomRightRadius);
            let geometry = new THREE.ShapeGeometry(shape);
            this._background = new THREE.Mesh(geometry, this.material);
            this.add(this._background);
            borderShape.holes.push(shape);
            geometry = new THREE.ShapeGeometry(borderShape);
            this._border = new THREE.Mesh(geometry, this.borderMaterial);
            this.add(this._border);
            this._border.renderOrder = renderOrder;
        } else {
            let shape = createShape(width, height, topLeftRadius,
                topRightRadius, bottomLeftRadius, bottomRightRadius);
            let geometry = new THREE.ShapeGeometry(shape);
            this._background = new THREE.Mesh(geometry, this.material);
            this.add(this._background);
        }
        this._background.renderOrder = renderOrder;
        if(!this.backgroundVisible)
            this._background.visible = false;
    }

    _createClippingPlanes() {
        this.clippingPlanes = [
            new THREE.Plane(new THREE.Vector3(0, 1, 0)),
            new THREE.Plane(new THREE.Vector3(0, -1, 0)),
            new THREE.Plane(new THREE.Vector3(1, 0, 0)),
            new THREE.Plane(new THREE.Vector3(-1, 0, 0))
        ];
        this._updateClippingPlanes();
        this.updateClippingPlanes(true);
        this.clippingPlanesUpdateId = UpdateHandler.add(
            () => this._updateClippingPlanes());
    }

    _getClippingPlanes() {
        let clippingPlanes = [];
        let object = this;
        while(object instanceof LayoutComponent) {
            if(object.clippingPlanes)
                clippingPlanes.push(...object.clippingPlanes);
            object = object.parentComponent;
        }
        return clippingPlanes.length ? clippingPlanes : null;
    }

    _clearClippingPlanes() {
        this.clippingPlanes = null;
        UpdateHandler.remove(this.clippingPlanesUpdateId);
        this.updateClippingPlanes(true);
    }

    _updateClippingPlanes() {
        let x = this.computedWidth / 2;
        let y = this.computedHeight / 2;
        this.clippingPlanes[0].constant = y;
        this.clippingPlanes[1].constant = y;
        this.clippingPlanes[2].constant = x;
        this.clippingPlanes[3].constant = x;
        this.clippingPlanes[0].normal.set(0, 1, 0);
        this.clippingPlanes[1].normal.set(0, -1, 0);
        this.clippingPlanes[2].normal.set(1, 0, 0);
        this.clippingPlanes[3].normal.set(-1, 0, 0);
        for(let plane of this.clippingPlanes) {
            plane.applyMatrix4(this.matrixWorld);
        }
    }

    updateClippingPlanes(recursive) {
        let clippingPlanes = this._getClippingPlanes();
        this.material.clippingPlanes = clippingPlanes;
        if(this._text) this._text.material.clippingPlanes = clippingPlanes;
        if(!recursive) return;
        for(let child of this._content.children) {
            if(child instanceof LayoutComponent)
                child.updateClippingPlanes(true);
        }
    }

    updateLayout() {
        let oldHeight = this.computedHeight;
        let oldWidth = this.computedWidth;
        let oldMarginedHeight = this.marginedHeight;
        let oldMarginedWidth = this.marginedWidth;
        let height = this._computeDimension('height');
        let width = this._computeDimension('width');
        let contentHeight = this._getContentHeight();
        let contentWidth = this._getContentWidth();
        let contentSize = this._content.children.reduce(
            (sum, child) => sum + (child instanceof LayoutComponent ? 1 : 0),0);
        let contentDirection = this.contentDirection;
        let alignItems = this.alignItems;
        let justifyContent = this.justifyContent;
        let p, dimension, dimensionName, otherDimension, sign, contentDimension,
            computedDimensionName, otherComputedDimensionName, marginPriorName,
            marginAfterName, otherMarginPriorName, otherMarginAfterName,
            vec2Param, otherVec2Param;
        let itemGap = 0;
        if(this.contentDirection == 'row') {
            dimension = -this.unpaddedWidth;
            contentDimension = -contentWidth;
            otherDimension = this.unpaddedHeight;
            computedDimensionName = 'computedWidth';
            otherComputedDimensionName = 'computedHeight';
            marginPriorName = 'marginLeft';
            marginAfterName = 'marginRight';
            otherMarginPriorName = 'marginTop';
            otherMarginAfterName = 'marginBottom';
            vec2Param = 'x';
            otherVec2Param = 'y';
            sign = 1;
        } else {
            dimension = this.unpaddedHeight;
            contentDimension = contentHeight;
            otherDimension = -this.unpaddedWidth;
            computedDimensionName = 'computedHeight';
            otherComputedDimensionName = 'computedWidth';
            marginPriorName = 'marginTop';
            marginAfterName = 'marginBottom';
            otherMarginPriorName = 'marginLeft';
            otherMarginAfterName = 'marginRight';
            vec2Param = 'y';
            otherVec2Param = 'x';
            sign = -1;
        }
        if(justifyContent == 'start') {
            p = dimension / 2;
        } else if(justifyContent == 'end') {
            p = dimension / -2 + contentDimension;
        } else if(justifyContent == 'center') {
            p = contentDimension / 2;
        } else if(Math.abs(dimension) - Math.abs(contentDimension) < 0) {
            //spaceBetween, spaceAround, and spaceEvenly act the same when
            //overflowed
            p = contentDimension / 2;
        } else {
            if(justifyContent == 'spaceBetween') {
                itemGap =  Math.abs(dimension - contentDimension)
                    / (contentSize - 1) * sign;
                p = dimension / 2;
            } else if(justifyContent == 'spaceAround') {
                itemGap = Math.abs(dimension - contentDimension)
                    / contentSize * sign;
                p = dimension / 2 + itemGap / 2;
            } else if(justifyContent == 'spaceEvenly') {
                itemGap = Math.abs(dimension - contentDimension)
                    / (contentSize + 1) * sign;
                p = dimension / 2 + itemGap;
            }
        }
        for(let child of this._content.children) {
            if(child instanceof LayoutComponent) {
                let margin = child.margin || 0;
                let marginPrior = numberOr(child[marginPriorName], margin);
                let marginAfter = numberOr(child[marginAfterName], margin);
                let otherMarginPrior = numberOr(child[otherMarginPriorName],
                    margin);
                let otherMarginAfter = numberOr(child[otherMarginAfterName],
                    margin);
                p += marginPrior * sign;
                child.position[vec2Param] = p + child[computedDimensionName]
                    / 2 * sign;
                p += child[computedDimensionName] * sign;
                p += marginAfter * sign;
                p += itemGap;
                if(alignItems == 'start') {
                    child.position[otherVec2Param] = otherDimension / 2
                        - child[otherComputedDimensionName] / 2 * sign
                        - otherMarginPrior * sign;
                } else if(alignItems == 'end') {
                    child.position[otherVec2Param] = -otherDimension / 2
                        + child[otherComputedDimensionName] / 2 * sign
                        + otherMarginAfter * sign;
                } else {
                    child.position[otherVec2Param] = 0;
                }
            }
        }
        if(oldWidth != width || oldHeight != height || oldMarginedHeight != this.marginedHeight || oldMarginedWidth != this.marginedWidth) {
            this._createBackground();
            if(this.clippingPlanes) this._updateClippingPlanes();
            if(this.parentComponent instanceof LayoutComponent)
                this.parent.parent.updateLayout();
            this._updateChildrensLayout(oldWidth != width, oldHeight != height);
        }
        if(oldWidth != width || oldHeight != height) {
            this._createBackground();
            if(this.clippingPlanes) this._updateClippingPlanes();
            if(this.parentComponent instanceof LayoutComponent)
                this.parent.parent.updateLayout();
            this._updateChildrensLayout(oldWidth != width, oldHeight != height);
        } else if(oldMarginedHeight != this.marginedHeight
                || oldMarginedWidth != this.marginedWidth) {
            if(this.clippingPlanes) this._updateClippingPlanes();
            if(this.parentComponent instanceof LayoutComponent)
                this.parent.parent.updateLayout();
        }
    }

    _updateChildrensLayout(widthChanged, heightChanged) {
        for(let child of this._content.children) {
            if(child instanceof LayoutComponent) {
                let needsUpdate = false;
                if(widthChanged) {
                    let width = child.width;
                    if(typeof width == 'string' && width.endsWith('%'))
                        needsUpdate = true;
                }
                if(!needsUpdate && heightChanged) {
                    let height = child.height;
                    if(typeof height == 'string' && height.endsWith('%'))
                        needsUpdate = true;
                }
                if(needsUpdate) child.updateLayout();
            }
        }
    }

    _computeDimension(dimensionName) {
        let dimension = this[dimensionName];
        let computedParam = 'computed' + capitalizeFirstLetter(dimensionName);
        if(typeof dimension == 'number') {
            this[computedParam] = dimension;
        } else if(dimension == 'auto') {
            if((this.contentDirection=='column') == (dimensionName=='height')) {
                let sum = 0;
                for(let child of this._content.children) {
                    if(child instanceof LayoutComponent)
                        sum += child[computedParam];
                }
                this[computedParam] = sum;
            } else {
                let max = 0;
                for(let child of this._content.children) {
                    if(child instanceof LayoutComponent)
                        max = Math.max(max, child[computedParam]);
                }
                this[computedParam] = max;
            }
        } else {
            let parentComponent = this.parentComponent;
            if(parentComponent instanceof LayoutComponent) {
                let percent = Number(dimension.replace('%', '')) / 100;
                this[computedParam] = parentComponent[computedParam] * percent;
            }
        }
        this._computeUnpaddedAndMarginedDimensions(dimensionName,
            this[computedParam]);
        return this[computedParam];
    }

    _computeUnpaddedAndMarginedDimensions(dimensionName, computed) {
        let marginedParam = 'margined' + capitalizeFirstLetter(dimensionName);
        let unpaddedParam = 'unpadded' + capitalizeFirstLetter(dimensionName);
        let direction = (dimensionName == 'height') ? 'Vertical' : 'Horizontal';
        this[unpaddedParam] = computed - this['padding' + direction];
        this[marginedParam] = computed + this['margin' + direction];
        if(dimensionName == 'height') {
            this.unpaddedHeight = Math.max(computed - this.paddingVertical, 0);
            this.marginedHeight = computed + this.marginVertical;
        } else {
            this.unpaddedWidth = Math.max(computed - this.paddingHorizontal, 0);
            this.marginedWidth = computed + this.marginHorizontal;
        }
    }

    _getContentHeight() {
        if(this.contentDirection == 'column') {
            let sum = 0;
            for(let child of this._content.children) {
                if(child instanceof LayoutComponent)
                    sum += child.marginedHeight;
            }
            return sum;
        } else {
            let max = 0;
            for(let child of this._content.children) {
                if(child instanceof LayoutComponent)
                    max = Math.max(max, child.marginedHeight);
            }
            return max;
        }
    }

    _getContentWidth() {
        if(this.contentDirection == 'row') {
            let sum = 0;
            for(let child of this._content.children) {
                if(child instanceof LayoutComponent)
                    sum += child.marginedWidth;
            }
            return sum;
        } else {
            let max = 0;
            for(let child of this._content.children) {
                if(child instanceof LayoutComponent)
                    max = Math.max(max, child.marginedWidth);
            }
            return max;
        }
    }

    _updateMaterialOffset(parentOffset) {
        this._materialOffset = parentOffset + 1;
        let material = this.material;
        let borderMaterial = this.borderMaterial;
        borderMaterial.polygonOffsetFactor = borderMaterial.polygonOffsetUnits
            = material.polygonOffsetFactor = material.polygonOffsetUnits
            = -1 * this._materialOffset;
        for(let child of this._content.children) {
            if(child instanceof LayoutComponent)
                child._updateMaterialOffset(this._materialOffset);
        }
        let order = 100 + this._materialOffset;
        if(this._background) this._background.renderOrder = order;
        if(this._border) this._border.renderOrder = order;
    }

    add(object) {
        if(arguments.length > 1) {
            for(let argument of arguments) {
                this.add(argument);
            }
        } else if(object instanceof UIComponent) {
            this._content.add(object);
            object.updateLayout();
            object._updateMaterialOffset(this._materialOffset);
            object.updateClippingPlanes(true);
            this.updateLayout();
        } else {
            super.add(object);
        }
    }

    remove(object) {
        if(arguments.length > 1) {
            for(let argument of arguments) {
                this.add(argument);
            }
        } else if(object instanceof UIComponent
                && !(object.constructor.name == 'Body')) {
            this._content.remove(object);
        } else {
            super.remove(object);
        }
    }

    get marginHorizontal() {
        let margin = this.margin || 0;
        let marginLeft = numberOr(this.marginLeft, margin);
        let marginRight = numberOr(this.marginRight, margin);
        return marginLeft + marginRight;
    }
    get marginVertical() {
        let margin = this.margin || 0;
        let marginTop = numberOr(this.marginTop, margin);
        let marginBottom = numberOr(this.marginBottom, margin);
        return marginTop + marginBottom;
    }
    get paddingHorizontal() {
        let padding = this.padding || 0;
        let paddingLeft = numberOr(this.paddingLeft, padding);
        let paddingRight = numberOr(this.paddingRight, padding);
        return paddingLeft + paddingRight;
    }
    get paddingVertical() {
        let padding = this.padding || 0;
        let paddingTop = numberOr(this.paddingTop, padding);
        let paddingBottom = numberOr(this.paddingBottom, padding);
        return paddingTop + paddingBottom;
    }
    get parentComponent() { return this.parent?.parent; }
}

//https://stackoverflow.com/a/65576761/11626958
function createShape(width, height, topLeftRadius, topRightRadius,
        bottomLeftRadius, bottomRightRadius) {
    let shape = new THREE.Shape();
    let halfWidth = width / 2;
    let halfHeight = height / 2;
    let negativeHalfWidth = halfWidth * -1;
    let negativeHalfHeight = halfHeight * -1;
    shape.moveTo(negativeHalfWidth, negativeHalfHeight + bottomLeftRadius);
    shape.lineTo(negativeHalfWidth, halfHeight - topLeftRadius);
    if(topLeftRadius)
        shape.absarc(negativeHalfWidth + topLeftRadius,
            halfHeight - topLeftRadius, topLeftRadius, Math.PI, Math.PI/2,true);
    shape.lineTo(halfWidth - topRightRadius, halfHeight);
    if(topRightRadius)
        shape.absarc(halfWidth - topRightRadius, halfHeight - topRightRadius,
            topRightRadius, Math.PI / 2, 0, true);
    shape.lineTo(halfWidth, negativeHalfHeight + bottomRightRadius);
    if(bottomRightRadius)
        shape.absarc(halfWidth - bottomRightRadius,
            negativeHalfHeight + bottomRightRadius, bottomRightRadius, 0,
            Math.PI / -2, true);
    shape.lineTo(negativeHalfWidth + bottomLeftRadius, negativeHalfHeight);
    if(bottomLeftRadius)
        shape.absarc(negativeHalfWidth + bottomLeftRadius,
            negativeHalfHeight + bottomLeftRadius, bottomLeftRadius,
            Math.PI / -2, -Math.PI, true);
    return shape;
}

export default LayoutComponent;
