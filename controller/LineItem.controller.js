sap.ui.define([
	"industry/gov/au/fi/arinv/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox"

], function(BaseController, JSONModel, MessageBox) {
	"use strict";

	return BaseController.extend("industry.gov.au.fi.arinv.controller.LineItem", {

		_oBinding: {},

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit: function() {
			var that = this;
			this.getRouter().getTargets().getTarget("lineitem").attachDisplay(null, this._onDisplay, this);
			this._oODataModel = this.getOwnerComponent().getModel();
			this._oResourceBundle = this.getResourceBundle();
			this._oitemViewModel = new JSONModel({
				enableCreate: false,
				delay: 0,
				busy: false,
				mode: "create",
				viewTitle: ""
			});

			//this.getRouter().getRoute("lineitem").attachPatternMatched(this._onObjectMatched, this);
			//this.getRouter().getTargets().getTarget("lineitem").attachDisplay(null, this._onDisplay, this);
			this.setModel(this._oitemViewModel, "itemViewModel");

			// Register the view with the message manager
			sap.ui.getCore().getMessageManager().registerObject(this.getView(), true);
			var oMessagesModel = sap.ui.getCore().getMessageManager().getMessageModel();
			this._oBinding = new sap.ui.model.Binding(oMessagesModel, "/", oMessagesModel.getContext("/"));
			this._oBinding.attachChange(function(oEvent) {
				var aMessages = oEvent.getSource().getModel().getData();
				for (var i = 0; i < aMessages.length; i++) {
					if (aMessages[i].type === "Error" && !aMessages[i].technical) {
						that._oitemViewModel.setProperty("/enableCreate", false);
					}
				}
			});
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Event handler (attached declaratively) for the view save button. Saves the changes added by the user. 
		 * @function
		 * @public
		 */
		onSave: function() {
			var that = this,
				oModel = this.getModel();

			// abort if the  model has not been changed
			if (!oModel.hasPendingChanges()) {
				MessageBox.information(
					this._oResourceBundle.getText("noChangesMessage"), {
						id: "noChangesInfoMessageBox",
						styleClass: that.getOwnerComponent().getContentDensityClass()
					}
				);
				return;
			}
			this.getModel("appView").setProperty("/busy", true);
			if (this._oitemViewModel.getProperty("/mode") === "edit") {
				// attach to the request completed event of the batch
				oModel.attachEventOnce("batchRequestCompleted", function(oEvent) {
					if (that._checkIfBatchRequestSucceeded(oEvent)) {
						that._fnUpdateSuccess();
					} else {
						that._fnEntityCreationFailed();
						MessageBox.error(that._oResourceBundle.getText("updateError"));
					}
				});
			}
			oModel.submitChanges();
		},

		_checkIfBatchRequestSucceeded: function(oEvent) {
			var oParams = oEvent.getParameters();
			var aRequests = oEvent.getParameters().requests;
			var oRequest;
			if (oParams.success) {
				if (aRequests) {
					for (var i = 0; i < aRequests.length; i++) {
						oRequest = oEvent.getParameters().requests[i];
						if (!oRequest.success) {
							return false;
						}
					}
				}
				return true;
			} else {
				return false;
			}
		},

		/**
		 * Event handler (attached declaratively) for the view cancel button. Asks the user confirmation to discard the changes. 
		 * @function
		 * @public
		 */

		/* =========================================================== */
		/* Internal functions
		/* =========================================================== */
		/**
		 * Navigates back in the browser history, if the entry was created by this app.
		 * If not, it navigates to the Details page
		 * @private
		 */
		_navBack: function() {
			// var oHistory = sap.ui.core.routing.History.getInstance(),
			// 	sPreviousHash = oHistory.getPreviousHash();

			// this.getView().unbindObject();
			// if (sPreviousHash !== undefined) {
			// 	// The history contains a previous entry
			// 	history.go(-1);
			// } else {
			// 	this.getRouter().getTargets().display("object");
			// }
			/*Change by Ram - when they click one button it is navigate back to launch pad instead of back*/
			this.getRouter().getTargets().display("object");
		},

		/**
		 * Opens a dialog letting the user either confirm or cancel the quit and discard of changes.
		 * @private
		 */
		_showConfirmQuitChanges: function() {
			var oComponent = this.getOwnerComponent(),
				oModel = this.getModel();

			var ocommonModel = this.getModel("commonModel");
			var sMode = this._oitemViewModel.getProperty("/mode");
			
			var that = this;
			MessageBox.confirm(
				this._oResourceBundle.getText("confirmCancelMessage"), {
					styleClass: oComponent.getContentDensityClass(),
					onClose: function(oAction) {
						if (oAction === sap.m.MessageBox.Action.OK) {
							that.getModel("appView").setProperty("/addEnabled", true);
							
							if (sMode === "create"){
								var oModelContext = new sap.ui.model.Context(oModel, that._sPath);
								oModel.deleteCreatedEntry(oModelContext);
								that._lineItemTable.removeItem(that._finalColumnListItem);
								var	iTotalItems = that._lineItemTable.getItems().length;
								var	sTitle = that.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
								that._detailViewModel.setProperty("/lineItemListTitle", sTitle);								
							}
							else {
								oModel.resetChanges([that._sPath]);
							}
							
							ocommonModel.setProperty("/actionFromLineItems", "Cancel");
							that._navBack();
						}
					}
				}
			);
		},

		/**
		 * Prepares the view for editing the selected object
		 * @param {sap.ui.base.Event} oEvent the  display event
		 * @private
		 */
		_onEdit: function(oEvent) {
			var oData = oEvent.getParameter("data"),
				oView = this.getView();
			this._oViewModel.setProperty("/mode", "edit");
			this._oViewModel.setProperty("/enableCreate", true);
			this._oViewModel.setProperty("/viewTitle", this._oResourceBundle.getText("editViewTitle"));

			oView.bindElement({
				path: oData.objectPath
			});
		},


		/**
		 * Checks if the save button can be enabled
		 * @private
		 */
		_validateSaveEnablement: function() {
			var aInputControls = this._getFormFields(this.byId("newEntitySimpleForm"));
			var oControl;
			for (var m = 0; m < aInputControls.length; m++) {
				oControl = aInputControls[m].control;
				if (aInputControls[m].required) {
					var sValue = oControl.getValue();
					if (!sValue) {
						this._oViewModel.setProperty("/enableCreate", false);
						return;
					}
				}
			}
			this._checkForErrorMessages();
		},

		/**
		 * Checks if there is any wrong inputs that can not be saved.
		 * @private
		 */

		_checkForErrorMessages: function() {
			var aMessages = this._oBinding.oModel.oData;
			if (aMessages.length > 0) {
				var bEnableCreate = true;
				for (var i = 0; i < aMessages.length; i++) {
					if (aMessages[i].type === "Error" && !aMessages[i].technical) {
						bEnableCreate = false;
						break;
					}
				}
				this._oViewModel.setProperty("/enableCreate", bEnableCreate);
			} else {
				this._oViewModel.setProperty("/enableCreate", true);
			}
		},

		/**
		 * Handles the success of updating an object
		 * @private
		 */
		_fnUpdateSuccess: function() {
			this.getModel("appView").setProperty("/busy", false);
			this.getView().unbindObject();
			this.getRouter().getTargets().display("object");
		},

		/**
		 * Handles the success of creating an object
		 *@param {object} oData the response of the save action
		 * @private
		 */
		_fnEntityCreated: function(oData) {
			var sObjectPath = this.getModel().createKey("InvoiceHeaderentitySet", oData);
			this.getModel("appView").setProperty("/itemToSelect", "/" + sObjectPath); //save last created
			this.getModel("appView").setProperty("/busy", false);
			this.getRouter().getTargets().display("object");
		},

		/**
		 * Handles the failure of creating/updating an object
		 * @private
		 */
		_fnEntityCreationFailed: function() {
			this.getModel("appView").setProperty("/busy", false);
		},

		/**
		 * Gets the form fields
		 * @param {sap.ui.layout.form} oSimpleForm the form in the view.
		 * @private
		 */
		_getFormFields: function(oSimpleForm) {
			var aControls = [];
			var aFormContent = oSimpleForm.getContent();
			var sControlType;
			for (var i = 0; i < aFormContent.length; i++) {
				sControlType = aFormContent[i].getMetadata().getName();
				if (sControlType === "sap.m.Input" || sControlType === "sap.m.DateTimeInput" ||
					sControlType === "sap.m.CheckBox") {
					aControls.push({
						control: aFormContent[i],
						required: aFormContent[i - 1].getRequired && aFormContent[i - 1].getRequired()
					});
				}
			}
			return aControls;
		},

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
		//custom coding//
		_onObjectMatched: function(oEvent) {
			var oParameter = oEvent.getParameter("arguments");
			for (var value in oParameter) {
				oParameter[value] = decodeURIComponent(oParameter[value]);
			}
			var requestID = oParameter.UId;

			var sObjectPath = "InvoiceItemsentitySet('" + requestID + "')";
			this._bindView("/" + sObjectPath);

		},

		onDoneItem: function(oEvent) {
			if(oEvent.getSource().getBindingContext().getProperty("Mwskz")===""){
				var _sTaxCode = this.getView().byId("taxCodeItem").getSelectedKey();
				this.getModel().setProperty("Mwskz",_sTaxCode,oEvent.getSource().getBindingContext());
			}
			if(oEvent.getSource().getBindingContext().getProperty("Menge")===""){
				this.getModel().setProperty("Menge","0.00",oEvent.getSource().getBindingContext());
			}
			var oTableItems = this._lineItemTable.getItems();
			var ocommonModel = this.getModel("commonModel");
			//headerTotalAmount
			var sHeaderTotal = this._headerContext.getProperty("Dmbtr");
			var sLineItemsTotal = 0;
			var sBalance = 0;
			var oTableItemContext = {};

			$.each(oTableItems, function(index, oTableItem) {
				oTableItemContext = oTableItem.getBindingContext();
				sLineItemsTotal = sLineItemsTotal + parseFloat(oTableItemContext.getProperty("Wrbtr"));
			});

			sBalance = sHeaderTotal - sLineItemsTotal;
			ocommonModel.setProperty("/Balance", sBalance);			
			
			this._navBack();
		},
		
		
		_bindView: function(sObjectPath) {
			// Set busy indicator during view binding
			var oitemViewModel = this.getModel("itemViewModel");

			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oitemViewModel.setProperty("/busy", false);

			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: this._onBindingChange.bind(this),
					dataRequested: function() {
						oitemViewModel.setProperty("/busy", true);
					},
					dataReceived: function() {
						oitemViewModel.setProperty("/busy", false);
					}
				}
			});
		},

		_onBindingChange: function() {
			var oView = this.getView(),
				oElementBinding = oView.getElementBinding(),
				oViewModel = this.getModel("detailView"),
				oAppViewModel = this.getModel("appView");

			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				// if object could not be found, the selection in the master list
				// does not make sense anymore.
				this.getOwnerComponent().oListSelector.clearMasterListSelection();
				return;
			} else {
				this._sPath = oElementBinding.getBoundContext().sPath;
			}
		},

		onItemCancel: function() {
			// check if the model has been changed
			if (this.getModel().hasPendingChanges()) {
				// get user confirmation first
				this._showConfirmQuitChanges(); // some other thing here....
			} else {
				this.getModel("appView").setProperty("/addEnabled", true);
				// cancel without confirmation
				this._navBack();
			}
		},

		_onDisplay: function(oEvent) {
			var oData = oEvent.getParameter("data");
			if (oData && oData.mode === "edit") {
				this._onEditItem(oEvent);
			} else if (oData.mode === "display") {
				this._onDisplayItem(oEvent);
			} else {
				this._onCreateItem(oEvent);

			}
		},

		_onDisplayItem: function(oEvent) {
			this._oitemViewModel.setProperty("/viewTitle", this._oResourceBundle.getText("createLineItemViewTitle"));
			this._oitemViewModel.setProperty("/mode", "display");
			var data = oEvent.getParameter("data");
			var itemContext = data.itemContext;
			this._lineItemTable = data.table;
			this._headerContext = data.headerContext;			
			this._sPath = itemContext.getPath();
			this.getView().setBindingContext(itemContext);
		},
		
		_onEditItem: function(oEvent) {
			this._oitemViewModel.setProperty("/viewTitle", this._oResourceBundle.getText("createLineItemViewTitle"));
			this._oitemViewModel.setProperty("/mode", "edit");
			var data = oEvent.getParameter("data");
			var itemContext = data.itemContext;
			this._lineItemTable = data.table;
			this._headerContext = data.headerContext;
			this._sPath = itemContext.getPath();
			this.getView().setBindingContext(itemContext);			
		},

		_onCreateItem: function(oEvent) {
			if (oEvent.getParameter("name") && oEvent.getParameter("name") !== "create") {
				this._oitemViewModel.setProperty("/enableCreate", false);
				this.getRouter().getTargets().detachDisplay(null, this._onDisplay, this);
				this.getView().unbindObject();
				return;
			}

			this._oitemViewModel.setProperty("/viewTitle", this._oResourceBundle.getText("createLineItemViewTitle"));
			this._oitemViewModel.setProperty("/mode", "create");
			var data = oEvent.getParameter("data");
			var reqID = data.UId;
			var NewLineItem = data.Buzei;
			var TaxCode = data.Mwskz;
			
			this._lineItemTable = data.table;
			this._headerContext = data.headerContext;
			this._finalColumnListItem = data.finalColumnListItem;
			this._detailViewModel		= data.detailViewModel;

			var oNewItemContext = data.newItemContext;
			this._sPath = oNewItemContext.getPath();

			this.getView().setBindingContext(oNewItemContext);
		}

	});

});