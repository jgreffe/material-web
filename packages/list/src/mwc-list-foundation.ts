/**
 @license
 Copyright 2020 Google Inc. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

import {MDCFoundation} from '@material/base/foundation';
import {cssClasses, numbers, strings} from '@material/list/constants';

import {MDCListAdapter} from './mwc-list-adapter';

export type MWCListIndex = number|Set<number>

    interface IndexDiff {
  added: number[];
  removed: number[];
}

const findIndexDiff = (oldSet: Set<number>, newSet: Set<number>): IndexDiff => {
  const oldArr = Array.from(oldSet);
  const newArr = Array.from(newSet);
  const diff: IndexDiff = {added: [], removed: []};
  const oldSorted = oldArr.sort();
  const newSorted = newArr.sort();

  let i = 0;
  let j = 0;
  while (i < oldSorted.length || j < newSorted.length) {
    const oldVal = oldSorted[i];
    const newVal = newSorted[j];

    if (oldVal === newVal) {
      i++;
      j++;
      continue;
    }

    if (oldVal !== undefined && (newVal === undefined || oldVal < newVal)) {
      diff.removed.push(oldVal);
      i++;
      continue;
    }

    if (newVal !== undefined && (oldVal === undefined || newVal < oldVal)) {
      diff.added.push(newVal);
      j++;
      continue;
    }
  }

  return diff;
};

const ELEMENTS_KEY_ALLOWED_IN = ['input', 'button', 'textarea', 'select'];

export function isNumberSet(selectedIndex: MWCListIndex):
    selectedIndex is Set<number> {
  return selectedIndex instanceof Set;
}

export const createSetFromIndex = (index: MWCListIndex) => {
  const entry = index === numbers.UNSET_INDEX ? new Set<number>() : index;
  return isNumberSet(entry) ? new Set(entry) : new Set([entry]);
};

export class MDCListFoundation extends MDCFoundation<MDCListAdapter> {
  static get strings() {
    return strings;
  }

  static get cssClasses() {
    return cssClasses;
  }

  static get numbers() {
    return numbers;
  }

  private get isSelectableList_() {
    return this.isSelectable_ || this.isMulti_;
  }


  static get defaultAdapter(): MDCListAdapter {
    return {
      focusItemAtIndex: () => undefined,
      getFocusedElementIndex: () => 0,
      getListItemCount: () => 0,
      isFocusInsideList: () => false,
      isRootFocused: () => false,
      notifyAction: () => undefined,
      getSelectedStateForElementIndex: () => false,
      setDisabledStateForElementIndex: () => undefined,
      getDisabledStateForElementIndex: () => false,
      setSelectedStateForElementIndex: () => undefined,
      setActivatedStateForElementIndex: () => undefined,
      setTabIndexForElementIndex: () => undefined,
      setAttributeForElementIndex: () => undefined,
      getAttributeForElementIndex: () => null,
    };
  }

  private isMulti_ = false;
  private isSelectable_ = false;
  private wrapFocus_ = false;
  private isVertical_ = true;
  private selectedIndex_: MWCListIndex = numbers.UNSET_INDEX;
  private focusedItemIndex_ = numbers.UNSET_INDEX;
  private useActivatedClass_ = false;
  private ariaCurrentAttrValue_: string|null = null;

  constructor(adapter?: Partial<MDCListAdapter>) {
    super({...MDCListFoundation.defaultAdapter, ...adapter});
  }

  /**
   * Sets the private wrapFocus_ variable.
   */
  setWrapFocus(value: boolean) {
    this.wrapFocus_ = value;
  }

  /**
   * Sets the private wrapFocus_ variable.
   */
  setMulti(value: boolean) {
    this.isMulti_ = value;
  }

  /**
   * Sets the isVertical_ private variable.
   */
  setVerticalOrientation(value: boolean) {
    this.isVertical_ = value;
  }

  /**
   * Sets the isSingleSelectionList_ private variable.
   */
  setSelectable(value: boolean) {
    this.isSelectable_ = value;
  }

  /**
   * Sets the useActivatedClass_ private variable.
   */
  setUseActivatedClass(useActivated: boolean) {
    this.useActivatedClass_ = useActivated;
  }

  getSelectedIndex(): MWCListIndex {
    return this.selectedIndex_;
  }

  setSelectedIndex(index: MWCListIndex) {
    if (!this.isIndexValid_(index)) {
      return;
    }

    if (this.isMulti_) {
      this.setMultiSelectionAtIndex_(createSetFromIndex(index));
    } else {
      this.setSingleSelectionAtIndex_(index as number);
    }
  }

  /**
   * Focus in handler for the list items.
   */
  handleFocusIn(_: FocusEvent, listItemIndex: number) {
    if (listItemIndex >= 0) {
      this.adapter_.setTabIndexForElementIndex(listItemIndex, 0);
    }
  }

  /**
   * Focus out handler for the list items.
   */
  handleFocusOut(_: FocusEvent, listItemIndex: number) {
    if (listItemIndex >= 0) {
      this.adapter_.setTabIndexForElementIndex(listItemIndex, -1);
    }

    /**
     * Between Focusout & Focusin some browsers do not have focus on any
     * element. Setting a delay to wait till the focus is moved to next element.
     */
    setTimeout(() => {
      if (!this.adapter_.isFocusInsideList()) {
        this.setTabindexToFirstSelectedItem_();
      }
    }, 0);
  }

  /**
   * Key handler for the list.
   */
  handleKeydown(
      evt: KeyboardEvent, isRootListItem: boolean, listItemIndex: number) {
    const isArrowLeft = evt.key === 'ArrowLeft' || evt.keyCode === 37;
    const isArrowUp = evt.key === 'ArrowUp' || evt.keyCode === 38;
    const isArrowRight = evt.key === 'ArrowRight' || evt.keyCode === 39;
    const isArrowDown = evt.key === 'ArrowDown' || evt.keyCode === 40;
    const isHome = evt.key === 'Home' || evt.keyCode === 36;
    const isEnd = evt.key === 'End' || evt.keyCode === 35;
    const isEnter = evt.key === 'Enter' || evt.keyCode === 13;
    const isSpace = evt.key === 'Space' || evt.keyCode === 32;

    if (this.adapter_.isRootFocused()) {
      if (isArrowUp || isEnd) {
        evt.preventDefault();
        this.focusLastElement();
      } else if (isArrowDown || isHome) {
        evt.preventDefault();
        this.focusFirstElement();
      }

      return;
    }

    let currentIndex = this.adapter_.getFocusedElementIndex();
    if (currentIndex === -1) {
      currentIndex = listItemIndex;
      if (currentIndex < 0) {
        // If this event doesn't have a mdc-list-item ancestor from the
        // current list (not from a sublist), return early.
        return;
      }
    }

    let nextIndex;
    if ((this.isVertical_ && isArrowDown) ||
        (!this.isVertical_ && isArrowRight)) {
      this.preventDefaultEvent_(evt);
      nextIndex = this.focusNextElement(currentIndex);
    } else if (
        (this.isVertical_ && isArrowUp) || (!this.isVertical_ && isArrowLeft)) {
      this.preventDefaultEvent_(evt);
      nextIndex = this.focusPrevElement(currentIndex);
    } else if (isHome) {
      this.preventDefaultEvent_(evt);
      nextIndex = this.focusFirstElement();
    } else if (isEnd) {
      this.preventDefaultEvent_(evt);
      nextIndex = this.focusLastElement();
    } else if (isEnter || isSpace) {
      if (isRootListItem) {
        // Return early if enter key is pressed on anchor element which triggers
        // synthetic MouseEvent event.
        const target = evt.target as Element | null;
        if (target && target.tagName === 'A' && isEnter) {
          return;
        }
        this.preventDefaultEvent_(evt);

        if (this.isSelectableList_) {
          this.setSelectedIndexOnAction_(currentIndex);
        }

        this.adapter_.notifyAction(currentIndex);
      }
    }

    this.focusedItemIndex_ = currentIndex;

    if (nextIndex !== undefined) {
      this.setTabindexAtIndex_(nextIndex);
      this.focusedItemIndex_ = nextIndex;
    }
  }

  /**
   * Click handler for the list.
   */
  handleClick(index: number, force?: boolean) {
    if (index === numbers.UNSET_INDEX) {
      return;
    }

    if (this.isSelectableList_) {
      this.setSelectedIndexOnAction_(index, force);
    }

    this.adapter_.notifyAction(index);

    this.setTabindexAtIndex_(index);
    this.focusedItemIndex_ = index;
  }

  /**
   * Focuses the next element on the list.
   */
  focusNextElement(index: number) {
    const count = this.adapter_.getListItemCount();
    let nextIndex = index + 1;
    if (nextIndex >= count) {
      if (this.wrapFocus_) {
        nextIndex = 0;
      } else {
        // Return early because last item is already focused.
        return index;
      }
    }
    this.adapter_.focusItemAtIndex(nextIndex);

    return nextIndex;
  }

  /**
   * Focuses the previous element on the list.
   */
  focusPrevElement(index: number) {
    let prevIndex = index - 1;
    if (prevIndex < 0) {
      if (this.wrapFocus_) {
        prevIndex = this.adapter_.getListItemCount() - 1;
      } else {
        // Return early because first item is already focused.
        return index;
      }
    }
    this.adapter_.focusItemAtIndex(prevIndex);

    return prevIndex;
  }

  focusFirstElement() {
    this.adapter_.focusItemAtIndex(0);
    return 0;
  }

  focusLastElement() {
    const lastIndex = this.adapter_.getListItemCount() - 1;
    this.adapter_.focusItemAtIndex(lastIndex);
    return lastIndex;
  }

  /**
   * @param itemIndex Index of the list item
   * @param isEnabled Sets the list item to enabled or disabled.
   */
  setEnabled(itemIndex: number, isEnabled: boolean): void {
    if (!this.isIndexValid_(itemIndex)) {
      return;
    }

    this.adapter_.setDisabledStateForElementIndex(itemIndex, !isEnabled);
  }

  /**
   * Ensures that preventDefault is only called if the containing element
   * doesn't consume the event, and it will cause an unintended scroll.
   */
  private preventDefaultEvent_(evt: KeyboardEvent) {
    const target = evt.target as Element;
    const tagName = `${target.tagName}`.toLowerCase();
    if (ELEMENTS_KEY_ALLOWED_IN.indexOf(tagName) === -1) {
      evt.preventDefault();
    }
  }

  private setSingleSelectionAtIndex_(index: number) {
    if (this.selectedIndex_ === index) {
      return;
    }

    // unset previous
    if (this.selectedIndex_ !== numbers.UNSET_INDEX) {
      this.adapter_.setSelectedStateForElementIndex(
          this.selectedIndex_ as number, false);
      if (this.useActivatedClass_) {
        this.adapter_.setActivatedStateForElementIndex(
            this.selectedIndex_ as number, false);
      }
    }

    // set new
    this.adapter_.setSelectedStateForElementIndex(index, true);
    if (this.useActivatedClass_) {
      this.adapter_.setActivatedStateForElementIndex(index, true);
    }
    this.setAriaForSingleSelectionAtIndex_(index);

    this.selectedIndex_ = index;
  }

  private setMultiSelectionAtIndex_(newIndex: Set<number>) {
    const oldIndex = createSetFromIndex(this.selectedIndex_);
    const diff = findIndexDiff(oldIndex, newIndex);

    if (!diff.removed.length && !diff.added.length) {
      return;
    }

    for (const removed of diff.removed) {
      this.adapter_.setSelectedStateForElementIndex(removed, false);

      if (this.useActivatedClass_) {
        this.adapter_.setActivatedStateForElementIndex(removed, false);
      }
    }

    for (const added of diff.added) {
      this.adapter_.setSelectedStateForElementIndex(added, true);

      if (this.useActivatedClass_) {
        this.adapter_.setActivatedStateForElementIndex(added, true);
      }
    }

    this.selectedIndex_ = newIndex;
  }

  /**
   * Sets aria attribute for single selection at given index.
   */
  private setAriaForSingleSelectionAtIndex_(index: number) {
    // Detect the presence of aria-current and get the value only during list
    // initialization when it is in unset state.
    if (this.selectedIndex_ === numbers.UNSET_INDEX) {
      this.ariaCurrentAttrValue_ = this.adapter_.getAttributeForElementIndex(
          index, strings.ARIA_CURRENT);
    }

    const isAriaCurrent = this.ariaCurrentAttrValue_ !== null;
    const ariaAttribute =
        isAriaCurrent ? strings.ARIA_CURRENT : strings.ARIA_SELECTED;

    if (this.selectedIndex_ !== numbers.UNSET_INDEX) {
      this.adapter_.setAttributeForElementIndex(
          this.selectedIndex_ as number, ariaAttribute, 'false');
    }

    const ariaAttributeValue =
        isAriaCurrent ? this.ariaCurrentAttrValue_ : 'true';
    this.adapter_.setAttributeForElementIndex(
        index, ariaAttribute, ariaAttributeValue as string);
  }

  private setTabindexAtIndex_(index: number) {
    if (this.focusedItemIndex_ === numbers.UNSET_INDEX && index !== 0) {
      // If no list item was selected set first list item's tabindex to -1.
      // Generally, tabindex is set to 0 on first list item of list that has no
      // preselected items.
      this.adapter_.setTabIndexForElementIndex(0, -1);
    } else if (
        this.focusedItemIndex_ >= 0 && this.focusedItemIndex_ !== index) {
      this.adapter_.setTabIndexForElementIndex(this.focusedItemIndex_, -1);
    }

    this.adapter_.setTabIndexForElementIndex(index, 0);
  }

  private setTabindexToFirstSelectedItem_() {
    let targetIndex = 0;

    if (this.isSelectableList_) {
      if (typeof this.selectedIndex_ === 'number' &&
          this.selectedIndex_ !== numbers.UNSET_INDEX) {
        targetIndex = this.selectedIndex_;
      } else if (
          isNumberSet(this.selectedIndex_) && this.selectedIndex_.size > 0) {
        targetIndex = Math.min(...this.selectedIndex_);
      }
    }

    this.setTabindexAtIndex_(targetIndex);
  }

  private isIndexValid_(index: MWCListIndex) {
    if (index instanceof Set) {
      if (!this.isMulti_) {
        throw new Error(
            'MDCListFoundation: Array of index is only supported for checkbox based list');
      }

      if (index.size === 0) {
        return true;
      } else {
        let isOneInRange = false;

        for (const entry of index) {
          isOneInRange = this.isIndexInRange_(entry);

          if (isOneInRange) {
            break;
          }
        }

        return isOneInRange;
      }
    } else if (typeof index === 'number') {
      if (this.isMulti_) {
        throw new Error(
            'MDCListFoundation: Expected array of index for checkbox based list but got number: ' +
            index);
      }
      return this.isIndexInRange_(index);
    } else {
      return false;
    }
  }

  private isIndexInRange_(index: number) {
    const listSize = this.adapter_.getListItemCount();
    return index >= 0 && index < listSize;
  }

  /**
   * Sets selected index on user action, toggles checkbox / radio based on
   * toggleCheckbox value. User interaction should not toggle list item(s) when
   * disabled.
   */
  private setSelectedIndexOnAction_(index: number, force?: boolean) {
    if (this.adapter_.getDisabledStateForElementIndex(index)) {
      return;
    }

    let checkedIndex: MWCListIndex = index;

    if (this.isMulti_) {
      checkedIndex = new Set([index]);
    }

    if (!this.isIndexValid_(checkedIndex)) {
      return;
    }

    if (this.isMulti_) {
      this.toggleMultiAtIndex(index, force);
    } else {
      this.setSingleSelectionAtIndex_(index);
    }
  }

  toggleMultiAtIndex(index: number, force?: boolean) {
    let isSelected = false;

    if (force === undefined) {
      isSelected = this.adapter_.getSelectedStateForElementIndex(index);
    } else {
      isSelected = force;
    }

    const newSet = createSetFromIndex(this.selectedIndex_);

    if (isSelected) {
      newSet.add(index);
    } else {
      newSet.delete(index);
    }

    this.setMultiSelectionAtIndex_(newSet);
  }
}

// tslint:disable-next-line:no-default-export Needed for backward compatibility
// with MDC Web v0.44.0 and earlier.
export default MDCListFoundation;
