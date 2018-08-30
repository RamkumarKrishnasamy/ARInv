/*global location */
sap.ui.define([
	"industry/gov/au/fi/arinv/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"industry/gov/au/fi/arinv/model/formatter",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/core/MessageType",
	"sap/ui/core/message/Message",
	"sap/ui/Device"
], function(BaseController, JSONModel, formatter, MessageBox, MessageToast, MessageType, Message, Device) {
	"use strict";

	return BaseController.extend("industry.gov.au.fi.arinv.controller.Detail", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit: function() {
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				lineItemListTitle: this.getResourceBundle().getText("detailLineItemTableHeading"),
				mode: "display"

			});
			this._emailCust = "";
			this._addEmailCust = "";
			this.getRouter().getTargets().getTarget("create").attachDisplay(null, this._onDisplay, this);
			this.getRouter().getRoute("object").attachPatternMatched(this._onObjectMatched, this);
			this.setModel(oViewModel, "detailView");
			this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));
			this._oODataModel = this.getOwnerComponent().getModel();
			this._oResourceBundle = this.getResourceBundle();

			// Register the view with the message manager
			var oMessageManager = sap.ui.getCore().getMessageManager();
			oMessageManager.registerObject(this.getView(), true);
			var oMessagesModel = oMessageManager.getMessageModel();
			this.getView().setModel(oMessagesModel, "message");

			this.oValueHelpDialog = null;

		},

		onTableListUpdateFinished: function(oEvent) {
			var oView = this.getView();
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");

			var ocommonModel = this.getModel("commonModel");
			var actionFromDetails = ocommonModel.getProperty("/actionFromDetails");
			var actionFromLineItems = ocommonModel.getProperty("/actionFromLineItems");
			ocommonModel.setProperty("/actionFromDetails", "");
			ocommonModel.setProperty("/actionFromLineItems", "");

			// only update the counter if the length is final
			if (this.byId("lineItemsList").getItems().length !== 0) {
				if (this.byId("lineItemsList").getBinding("items").isLengthFinal()) {

					if (iTotalItems) {
						sTitle = this.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
					} else {
						//Display 'Line Items' instead of 'Line items (0)'
						sTitle = this.getResourceBundle().getText("detailLineItemTableHeading");
					}
					oViewModel.setProperty("/lineItemListTitle", sTitle);
				}
			}
			var oLineItemTable = this.byId("lineItemsList");

			if (this._TCListItems) {

				iTotalItems = this.byId("lineItemsList").getItems().length;
				sTitle = this.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
				oViewModel.setProperty("/lineItemListTitle", sTitle);
			}

			var oTableItems = oLineItemTable.getItems();

			var sHeaderTotal = oView.byId("headerInvoiceAmount").getValue();
			var sLineItemsTotal = 0;
			var sBalance = 0;
			var oTableItemContext = {};

			$.each(oTableItems, function(index, oTableItem) {
				oTableItemContext = oTableItem.getBindingContext();
				sLineItemsTotal = sLineItemsTotal + parseFloat(oTableItemContext.getProperty("Wrbtr"));
			});

			sBalance = sHeaderTotal - sLineItemsTotal;
			ocommonModel.setProperty("/Balance", sBalance);

		},

		onDelete: function(oEvent) {
			var that = this;
			var oViewModel = this.getModel("detailView"),
				sPath = oViewModel.getProperty("/sObjectPath"),
				sObjectHeader = this._oODataModel.getProperty(sPath + "/VendName"),
				sQuestion = this._oResourceBundle.getText("deleteText", sObjectHeader),
				sSuccessMessage = this._oResourceBundle.getText("deleteSuccess", sObjectHeader);

			var fnMyAfterDeleted = function() {
				MessageToast.show(sSuccessMessage);
				oViewModel.setProperty("/busy", false);
				var oNextItemToSelect = that.getOwnerComponent().oListSelector.findNextItem(sPath);
				that.getModel("appView").setProperty("/itemToSelect", oNextItemToSelect.getBindingContext().getPath()); //save last deleted
			};
			this._confirmDeletionByUser({
				question: sQuestion
			}, [sPath], fnMyAfterDeleted);
		},

		_bindView: function(sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("detailView");
			var oCommonModel = this.getModel("commonModel");
			var oView = this.getView();

			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);

			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: this._onBindingChange.bind(this),
					dataRequested: function() {
						oViewModel.setProperty("/busy", true);
					},
					dataReceived: function() {
						oViewModel.setProperty("/busy", false);

						if (oView.getBindingContext()) {
							var defObject = oView.getModel().getObject("/InvoiceDefaultsSet('" + oView.getBindingContext().getProperty(
								"UId") + "')");

							if (defObject) {
								oCommonModel.setProperty("/FinalLineItem", defObject.FinalLineItem);
								oCommonModel.setProperty("/FinalAttachSeq", defObject.FinalAttachSeq);
							}
						}

					}
				},

				parameters: {
					expand: 'InvoiceDefaults'
				}

			});
		},

		/**
		 * Event handler for binding change event
		 * @function
		 * @private
		 */

		_onBindingChange: function() {
			var oView = this.getView(),
				oElementBinding = oView.getElementBinding(),
				oViewModel = this.getModel("detailView"),
				oAppViewModel = this.getModel("appView");
			var oCommonModel = this.getModel("commonModel");

			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				// if object could not be found, the selection in the master list
				// does not make sense anymore.
				this.getOwnerComponent().oListSelector.clearMasterListSelection();
				return;
			}

			if (sap.ui.getCore().getMessageManager()) {
				sap.ui.getCore().getMessageManager().removeAllMessages();
			}

			var sPath = oElementBinding.getBoundContext().getPath(),
				oResourceBundle = this.getResourceBundle(),
				oObject = oView.getModel().getObject(sPath),
				sObjectId = oObject.UId,
				sObjectName = oObject.VendName;

			oViewModel.setProperty("/sObjectId", sObjectId);
			oViewModel.setProperty("/sObjectPath", sPath);
			oAppViewModel.setProperty("/itemToSelect", sPath);
			this.getOwnerComponent().oListSelector.selectAListItem(sPath);

			oViewModel.setProperty("/saveAsTileTitle", oResourceBundle.getText("shareSaveTileAppTitle", [sObjectName]));

			if (!sObjectId) {
				oViewModel.setProperty("/mode", 'edit');
			}
			var ocommonModel = this.getModel("commonModel");

			ocommonModel.setProperty("/actionFromDetails", "");
			ocommonModel.setProperty("/actionFromLineItems", "");

			this.removeNewItemsFromTable();

			this.getModel("detailView").setProperty("/mode", "display");

			if (oView.getBindingContext()) {
				var defObject = oView.getModel().getObject("/InvoiceDefaultsSet('" + oView.getBindingContext().getProperty(
					"UId") + "')");

				if (defObject) {
					oCommonModel.setProperty("/FinalLineItem", defObject.FinalLineItem);
					oCommonModel.setProperty("/FinalAttachSeq", defObject.FinalAttachSeq);
				} else {
					oCommonModel.setProperty("/FinalLineItem", "00");
					oCommonModel.setProperty("/FinalAttachSeq", "0");
				}
				/*Copy Email*/
				var oContext = oView.getBindingContext();
				this._emailCust = oContext.getProperty("EmailCust");
				this._addEmailCust = oContext.getProperty("AddcustEmail");
			}

			if (!this._oTemplate) {
				this._oTemplate = sap.ui.xmlfragment({
					fragmentName: "industry.gov.au.fi.arinv.view.InvoiceLineItems",
					type: "XML",
					oController: this
				});
			}
			var oTable = oView.byId("lineItemsList");
			this.removeNewItemsFromTable();
			oTable.unbindItems();
			oTable.bindItems(sPath + "/Items", this._oTemplate);

		},

		_onMetadataLoaded: function() {
			// Store original busy indicator delay for the detail view
			var iOriginalViewBusyDelay = this.getView().getBusyIndicatorDelay(),
				oViewModel = this.getModel("detailView"),
				oLineItemTable = this.byId("lineItemsList"),
				iOriginalLineItemTableBusyDelay = oLineItemTable.getBusyIndicatorDelay();

			// Make sure busy indicator is displayed immediately when
			// detail view is displayed for the first time
			oViewModel.setProperty("/delay", 0);
			oViewModel.setProperty("/lineItemTableDelay", 0);

			oLineItemTable.attachEventOnce("updateFinished", function() {
				// Restore original busy indicator delay for line item table
				oViewModel.setProperty("/lineItemTableDelay", iOriginalLineItemTableBusyDelay);
			});

			// Binding the view will set it to not busy - so the view is always busy if it is not bound
			oViewModel.setProperty("/busy", true);
			// Restore original busy indicator delay for the detail view
			oViewModel.setProperty("/delay", iOriginalViewBusyDelay);
		},

		onAddItem: function(oEvent) {

			var oRouter = this.getRouter();
			var oView = this.getView();
			var oViewModel = this.getModel("detailView");
			var oContext = oView.getBindingContext();
			var reqID = oView.getBindingContext().getProperty("UId");
			//var reqTax = oView.getBindingContext().getProperty("VendTax");
			var TaxCode = "";

			/*			if (reqTax === "" || !reqTax) {
							TaxCode = "P1";
						} else {
							if (reqTax === true) {
								TaxCode = "P2";
							} else if (reqTax === false) {
								TaxCode = "P1";
							}
						}*/

			var oTable = oView.byId("lineItemsList");

			var ocommonModel = this.getModel("commonModel");
			var FinalLineItem = ocommonModel.getProperty("/FinalLineItem");
			FinalLineItem = parseInt(FinalLineItem, 10) + 10;
			ocommonModel.setProperty("/FinalLineItem", FinalLineItem);

			if (!reqID) {
				reqID = "";
			}

			var oNewItemContext = this.getModel().createEntry("InvoiceItemsentitySet", {
				properties: {
					UId: reqID,
					Buzei: FinalLineItem.toString(),
					Mwskz: TaxCode,
					Wrbtr: "0"
				},
				context: oContext

			});
			/* Changed by RAM - 07-08-2018 - START */
			if (!this._oTemplate) {
				this._oTemplate = sap.ui.xmlfragment({
					fragmentName: "industry.gov.au.fi.apinv.view.InvoiceLineItems",
					type: "XML",
					oController: this
				});
			}
			/* Changed by RAM - 07-08-2018 - END */

			var listItemForTable = this._oTemplate.clone();

			listItemForTable.setBindingContext(oNewItemContext);
			oTable.addItem(listItemForTable);

			var iTotalItems = oTable.getItems().length;
			var sTitle = this.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
			oViewModel.setProperty("/lineItemListTitle", sTitle);

			this._collectNewItems(listItemForTable);
			this._finalColumnListItem = listItemForTable;
			ocommonModel.setProperty("/actionFromDetails", "Create");
			ocommonModel.setProperty("/actionFromLineItems", "");

			oRouter.getTargets().display("lineitem", {
				mode: "create",
				UId: reqID,
				Buzei: FinalLineItem.toString(),
				Mwskz: TaxCode,
				newItemContext: oNewItemContext,
				headerContext: oView.getBindingContext(),
				tableContext: oView.byId("lineItemsList").getBindingContext(),
				table: oView.byId("lineItemsList"),
				finalColumnListItem: this._finalColumnListItem,
				detailViewModel: this.getModel("detailView")

			});

		},

		onPressTableItem: function(oEvent) {
			var oView = this.getView();
			var oDetailView = this.getModel("detailView");
			var sMode = oDetailView.getProperty("/mode");
			var sItemMode = "";
			var ocommonModel = this.getModel("commonModel");

			var oAppView = this.getModel("appView");
			var sFromMyInbox = oAppView.getProperty("/fromMyInbox");

			if (sFromMyInbox === false) {
				if (sMode === "create" || sMode === "edit") {
					sItemMode = "edit";
					ocommonModel.setProperty("/actionFromDetails", "Change");
					ocommonModel.setProperty("/actionFromLineItems", "");
				} else {
					sItemMode = "display";
					ocommonModel.setProperty("/actionFromDetails", "Display");
					ocommonModel.setProperty("/actionFromLineItems", "");
				}
				this.getRouter().getTargets().display("lineitem", {
					mode: sItemMode,
					headerContext: oView.getBindingContext(),
					itemContext: oEvent.getSource().getBindingContext(),
					tableContext: oView.byId("lineItemsList").getBindingContext(),
					table: oView.byId("lineItemsList")
				});
			}

		},

		onEdit: function() {
			this.getModel("detailView").setProperty("/mode", 'edit');
		},

		onCancel: function() {

			// check if the model has been changed
			if (this.getModel().hasPendingChanges()) {
				// get user confirmation first
				this._showConfirmQuitChanges(); // some other thing here....
			} else {
				this.getModel("appView").setProperty("/addEnabled", true);
				// cancel without confirmation
				var mode = this.getModel("detailView").getProperty("/mode");
				if (mode === "create") {
					this._navBack();
					this.getModel("detailView").setProperty("/mode", "display");
				} else {
					this.getModel("detailView").setProperty("/mode", "display");
				}
			}
		},

		_showConfirmQuitChanges: function() {
			var oComponent = this.getOwnerComponent();
			var oModel = this.getModel();
			var oDetailView = this.getModel("detailView");
			var oTable = this.getView().byId("lineItemsList");
			var UId = this.getView().getBindingContext().getObject().UId;

			var that = this;
			MessageBox.confirm(
				this._oResourceBundle.getText("confirmCancelMessage"), {
					styleClass: oComponent.getContentDensityClass(),
					onClose: function(oAction) {
						if (oAction === sap.m.MessageBox.Action.OK) {

							that.getModel("appView").setProperty("/addEnabled", true);
							oModel.resetChanges();
							that.removeNewItemsFromTable();
							oTable.unbindItems();

							if (!UId) {
								var mode = oDetailView.getProperty("/mode");
								if (mode === "create") {
									that._navBack();
									oDetailView.setProperty("/mode", "display");
								} else {
									oDetailView.setProperty("/mode", "display");
								}
							} else {
								oDetailView.setProperty("/mode", "display");
							}

						}
					}
				}
			);
		},

		_navBack: function() {
			this.getModel("appView").setProperty("/appMode", "ShowHideMode");

			var oHistory = sap.ui.core.routing.History.getInstance(),
				sPreviousHash = oHistory.getPreviousHash();

			this.getView().unbindObject();
			if (sPreviousHash !== undefined) {
				// The history contains a previous entry
				history.go(-1);
			} else {
				//this.getRouter().getTargets().display("detailObjectNotFound");
				//this.getRouter().getTargets().display("object");
				this.getRouter().navTo("master", {}, true);
			}
		},

		_onObjectMatched: function(oEvent) {
			var oParameter = oEvent.getParameter("arguments");
			for (var value in oParameter) {
				oParameter[value] = decodeURIComponent(oParameter[value]);
			}
			this.getModel().metadataLoaded().then(function() {
				var sObjectPath = this.getModel().createKey("InvoiceHeaderentitySet", oParameter);
				this._bindView("/" + sObjectPath);
				if (!this._oUploadTemplate) {
					this._oUploadTemplate = sap.ui.xmlfragment({
						fragmentName: "industry.gov.au.fi.arinv.view.UploadCollection",
						type: "XML",
						oController: this
					});
				}

				var oUploadCollection = this.getView().byId("InvoiceAttachmentsCollection");
				oUploadCollection.bindItems("/" + sObjectPath + "/Attachments", this._oUploadTemplate);
			}.bind(this));
		},

		_getMessagePopover: function() {
			// create popover lazily (singleton)
			if (!this._oMessagePopover) {
				// create popover lazily (singleton)
				this._oMessagePopover = sap.ui.xmlfragment(this.getView().getId(), "industry.gov.au.fi.arinv.view.MessagePopover", this);
				this.getView().addDependent(this._oMessagePopover);
			}
			return this._oMessagePopover;
		},

		onMessagePopoverPress: function(oEvent) {
			this._getMessagePopover().openBy(oEvent.getSource());
		},

		onSuccessPress: function(sMessage) {
			var oMessage = new Message({
				message: sMessage,
				type: MessageType.Success,
				target: "/Dummy"
			});
			sap.ui.getCore().getMessageManager().addMessages(oMessage);
		},

		onErrorPress: function(sMessage) {
			var oMessage = new Message({
				message: sMessage,
				type: MessageType.Error,
				target: "/Dummy"
			});
			sap.ui.getCore().getMessageManager().addMessages(oMessage);
		},

		onWarningPress: function(sMessage) {
			var oMessage = new Message({
				message: sMessage,
				type: MessageType.Warning,
				target: "/Dummy"
			});

			sap.ui.getCore().getMessageManager().addMessages(oMessage);
		},

		onSave: function(oEvent) {
			var that = this;
			var oView = this.getView();
			var oModel = oView.getModel();

			var detailViewModel = this.getView().getModel("detailView");

			sap.ui.getCore().getMessageManager().removeAllMessages();

			// abort if the  model has not been changed
			if (!oModel.hasPendingChanges()) {
				if (oModel.getDeferredGroups().length > 1) {

					this.getModel("appView").setProperty("/busy", true);

					oModel.submitChanges({
						groupId: "InvoiceItemDeleteRequest",
						success: function(oData) {
							that.getModel("appView").setProperty("/busy", false);
							that.onSuccessPress("Items deleted successfully");
						},
						error: function(oError) {
							that.getModel("appView").setProperty("/busy", false);
						}
					});
				}

				this.StartUpload();
				return;
			}

			if (oModel.getDeferredGroups().length > 1) {

				this.getModel("appView").setProperty("/busy", true);

				oModel.submitChanges({
					groupId: "InvoiceItemDeleteRequest",
					success: function(oData) {
						that.getModel("appView").setProperty("/busy", false);
						that.onSuccessPress("Items deleted successfully");

					},
					error: function(oError) {
						that.getModel("appView").setProperty("/busy", false);
						//console.log(oError);
					}
				});
			}

			if (oModel.hasPendingChanges()) {
				this.getModel("appView").setProperty("/busy", true);

				if (detailViewModel.getProperty("/mode") === "edit" || detailViewModel.getProperty("/mode") === "create") {
					// attach to the request completed event of the batch
					oModel.attachEventOnce("batchRequestCompleted", function(oEvent) {
						if (that._checkIfBatchRequestSucceeded(oEvent)) {
							that._fnUpdateSuccess(oEvent);
						} else {
							that.getModel("appView").setProperty("/busy", false);
							var errors = sap.ui.getCore().getMessageManager().getMessageModel().getData();

							errors.sort(function(a, b) {
								return (a.message > b.message) ? 1 : ((b.message > a.message) ? -1 : 0);
							});

							if (that._oMessagePopover) {
								that._oMessagePopover.destroy();
								that._oMessagePopover = null;
							}

							var obj = {};

							for (var i = 0, len = errors.length; i < len; i++)
								obj[errors[i]['message']] = errors[i];

							errors = new Array();

							for (var key in obj)
								errors.push(obj[key]);

							sap.ui.getCore().getMessageManager().getMessageModel().setData(errors);
						}
					});
				}

				oModel.submitChanges();
			}
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

		StartUpload: function(oEvent) {
			var oUploadCollection = this.byId("InvoiceAttachmentsCollection");
			var cFiles = oUploadCollection.getItems().length;
			var uploadInfo = cFiles + " file(s)";

			if (cFiles > 0) {
				oUploadCollection.upload();
			}
		},

		_fnUpdateSuccess: function(oEvent) {
			this.StartUpload();
			this.getModel("appView").setProperty("/busy", false);
			this.getModel("detailView").setProperty("/mode", "display");
			this.getModel("appView").setProperty("/addEnabled", true);

			var oView = this.getView();
			var sPath = oView.getBindingContext().getPath();

			MessageToast.show("Request Saved Successfully");

			var oMessage = new Message({
				message: "Request Saved Successfully",
				type: MessageType.Success,
				target: "/Dummy"
			});

			sap.ui.getCore().getMessageManager().addMessages(oMessage);

			var bReplace = !Device.system.phone;

			this.removeNewItemsFromTable();

			var oTable = this.getView().byId("lineItemsList");
			oTable.unbindItems();
			oTable.bindItems(sPath + "/Items", this._oTemplate);

			if (oView.getElementBinding()) {
				oView.getElementBinding().refresh();
			}

			this.getRouter().navTo("object", {
				UId: encodeURIComponent(oView.getBindingContext().getProperty("UId"))
			}, bReplace);
		},

		_fnEntityCreationFailed: function() {
			this.getModel("appView").setProperty("/busy", false);

		},

		/* Retrieve CSRF token from OModel */
		getXsrfToken: function() {
			var oModel = this.getView().getModel();

			return oModel.getSecurityToken();
		},

		onUploadChange: function(oEvent) {
			var oUploadCollection = oEvent.getSource();
			var oCustomerHeaderToken = new sap.m.UploadCollectionParameter({
				name: "x-csrf-token",
				value: this.getXsrfToken()
			});

			oUploadCollection.addHeaderParameter(oCustomerHeaderToken);

			var fileDetails = oEvent.getParameters().getParameter("files")[0];

			var oCommonModel = this.getModel("commonModel");
			var FinalAttachSeq = oCommonModel.getProperty("/FinalAttachSeq");
			FinalAttachSeq = parseInt(FinalAttachSeq, 10) + 1;
			oCommonModel.setProperty("/FinalAttachSeq", FinalAttachSeq);

			var sLastModified = new Date(fileDetails.lastModified);
			var dateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
				pattern: "yyyyMMddKKmmss"
			});

			sLastModified = dateFormat.format(sLastModified, false);

			var s = encodeURIComponent(FinalAttachSeq) + ";fileName=" +
				encodeURIComponent(fileDetails.name) + ";fileSize=" +
				encodeURIComponent(fileDetails.size) + ";lastModified=" +
				encodeURIComponent(sLastModified);

			var c = new sap.m.UploadCollectionParameter({
				name: "tslug",
				value: s
			});

			oUploadCollection.addHeaderParameter(c);
		},

		onBeforeUploadFile: function(oEvent) {

			this.getModel("appView").setProperty("/busy", true);

			var tslug = oEvent.getParameters().getHeaderParameter("tslug").getValue();

			var sReqId = this.getView().getBindingContext().getProperty("UId");

			var s = encodeURIComponent(sReqId) + ";" + tslug;

			var c = new sap.m.UploadCollectionParameter({
				name: "slug",
				value: s
			});

			oEvent.getParameters().addHeaderParameter(c);

		},

		onFormTypeSelect: function(oEvent) {
			var oView = this.getView();
			var oModel = oView.getModel();
			var bContext = this.getView().getBindingContext();

			if (oEvent.getSource().getSelectedIndex() === 0) {
				oModel.setProperty("InvType", "1", bContext);
			} else if (oEvent.getSource().getSelectedIndex() === 1) {
				oModel.setProperty("InvType", "2", bContext);
			} else {
				oModel.setProperty("InvType", "3", bContext);
			}

		},

		onValueExceedSelect: function(oEvent) {
			var oView = this.getView();
			var oModel = oView.getModel();
			var bContext = this.getView().getBindingContext();

			if (oEvent.getSource().getSelectedIndex() === 0) {
				oModel.setProperty("InvFlg", "1", bContext);
			} else if (oEvent.getSource().getSelectedIndex() === 1) {
				oModel.setProperty("InvFlg", "2", bContext);
			}

		},

		onUploadComplete: function(oEvent) {
			var oView = this.getView();
			var oParameters = oEvent.getParameters().getParameters();

			this.getModel("appView").setProperty("/busy", false);

			if (oParameters.status >= 200 && oParameters.status <= 299) {
				//oView.byId("InvoiceAttachmentsCollection").getBinding("items").refresh(true);
				if (!this._oUploadTemplate) {
					this._oUploadTemplate = sap.ui.xmlfragment({
						fragmentName: "industry.gov.au.fi.arinv.view.UploadCollection",
						type: "XML",
						oController: this
					});
				}
				var sPath = oView.getBindingContext().getPath();
				var oUploadCollection = oView.byId("InvoiceAttachmentsCollection");
				oUploadCollection.bindItems({
					path: sPath + "/Attachments",
					template: this._oUploadTemplate,
					suspended: false
				});

				var oMessage = new Message({
					message: oParameters.fileName + " uploaded successfully",
					type: MessageType.Success,
					target: "/Dummy"
				});

				sap.ui.getCore().getMessageManager().addMessages(oMessage);
			} else {
				var sResponse = JSON.parse(oParameters.responseRaw).error.message.value;

				sap.m.MessageBox.show(sResponse, {
					icon: sap.m.MessageBox.Icon.ERROR,
					title: oParameters.fileName + 'Upload Failed',
					actions: sap.m.MessageBox.Action.OK
				});
			}

		},

		getCustomerDetails: function(oEvent) {
			var oView = this.getView();
			var oModel = oView.getModel();
			var sCustomer = oView.byId("customerCode").getValue();
			var sCompany = oView.byId("companyCode").getValue();
			var oViewModel = oView.getModel("detailView");
			var oContext = oView.getBindingContext();
			var oTable = oView.byId("lineItemsList");
			var oTableItems = oTable.getItems();
			var sInvType = oContext.getProperty("InvType");

			if (sCompany !== "" && sCustomer !== "") {

				oViewModel.setProperty("/busy", true);
				var that = this;
				oModel.callFunction("/GetCustomerDetails", {
					method: "GET",
					urlParameters: {
						"Company": sCompany,
						"Customer": sCustomer,
						"InvoiceType": sInvType
					},

					context: null,
					success: function(oCustomerDetails, response) {
						oViewModel.setProperty("/busy", false);

						oModel.setProperty("CustName", oCustomerDetails.CustName, oContext);
						oModel.setProperty("Addr1", oCustomerDetails.Addr1, oContext);
						oModel.setProperty("Addr2", oCustomerDetails.Addr2, oContext);
						oModel.setProperty("Addr3", oCustomerDetails.Addr3, oContext);
						oModel.setProperty("Taxnum", oCustomerDetails.Taxnum, oContext);
						oModel.setProperty("EmailCust", oCustomerDetails.EmailCust, oContext);
						that._emailCust = oCustomerDetails.EmailCust;
						oModel.setProperty("Zterm", oCustomerDetails.Zterm, oContext);
						//change Tax Code

						$.each(oTableItems, function(index, oTableItem) {
							var oTableItemContext = oTableItem.getBindingContext();
							oModel.setProperty("Mwskz", oCustomerDetails.TaxCode, oTableItemContext);
						});

					},

					error: function(oError) {

						oViewModel.setProperty("/busy", false);

					}
				});
			}
		},

		removeNewItemsFromTable: function(oEvent) {

			if (this._TCListItems) {
				var table = this.getView().byId("lineItemsList");
				var TableColumnListItems = [];
				TableColumnListItems = this._TCListItems;
				var i;
				for (i = 0; i < TableColumnListItems.length; i++) {
					if (TableColumnListItems[i]) {
						table.removeItem(TableColumnListItems[i]);
						TableColumnListItems[i].destroyDependents();
						TableColumnListItems[i].destroyCells();
					}
					if (TableColumnListItems[i]) {
						TableColumnListItems[i].destroy();
					}
				}

				this._TCListItems = [];
			}
		},

		_collectNewItems: function(oListItem) {
			var TableColumnListItems = [];

			if (typeof this._TCListItems !== "undefined") {
				TableColumnListItems = this._TCListItems;
			}

			TableColumnListItems.push(oListItem);
			this._TCListItems = TableColumnListItems;
			this._finalColumnListItemIndex = this._TCListItems.length - 1;
		}

		,

		onDeleteTableItem: function(oEvent) {
			var lineItemNumber = oEvent.getParameters().listItem.getBindingContext().getProperty("Buzei");
			var columnListItem = oEvent.getParameters().listItem;

			var oViewModel = this.getModel("detailView");
			var sQuestion = this._oResourceBundle.getText("deleteLineItemText", lineItemNumber);
			var sSuccessMessage = this._oResourceBundle.getText("deleteLineItemSuccess", lineItemNumber);

			var fnMyAfterDeleted = function() {
				MessageToast.show(sSuccessMessage);
				oViewModel.setProperty("/busy", false);
			};

			this._confirmDeletionByUser({
				question: sQuestion
			}, columnListItem);
		},

		_onDisplay: function(oEvent) {
			var oData = oEvent.getParameter("data");
			if (oData && oData.mode === "create") {
				this._onDetailViewCreate(oEvent);
			}
		},

		_confirmDeletionByUser: function(oConfirmation, oColumnListItem) {

			var oModel = this.getView().getModel();
			var table = this.getView().byId("lineItemsList");
			var oContext = oColumnListItem.getBindingContext();
			var oViewModel = this.getModel("detailView");

			var fnDelete = function() {
				oModel.deleteCreatedEntry(oContext);
				if (oModel.getDeferredGroups().length < 2) {
					oModel.setDeferredGroups(oModel.getDeferredGroups().concat(["InvoiceItemDeleteRequest"]));
				}

				if (oContext.getPath().startsWith("/InvoiceItemsentitySet(UId=")) {
					oModel.remove(oContext.sPath, {
						groupId: "InvoiceItemDeleteRequest"
					});
				}

				table.removeItem(oColumnListItem);
				oColumnListItem.destroyDependents();
				oColumnListItem.destroy();

				//update line item count
				if (this.byId("lineItemsList").getItems()) {
					var iTotalItems = this.byId("lineItemsList").getItems().length;
					var sTitle = this.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
					oViewModel.setProperty("/lineItemListTitle", sTitle);
				}

			}.bind(this);

			var fnDeleteCanceled = function() {}.bind(this);

			MessageBox.show(oConfirmation.question, {
				icon: oConfirmation.icon || MessageBox.Icon.WARNING,
				title: oConfirmation.title || this._oResourceBundle.getText("delete"),
				actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
				onClose: function(oAction) {
					if (oAction === MessageBox.Action.OK) {
						fnDelete();
					} else if (fnDeleteCanceled) {
						fnDeleteCanceled();
					}
				}
			});
		},

		_onDetailViewCreate: function(oEvent) {
			var oViewModel = this.getModel("detailView");
			var oModel = this.getModel();

			if (oEvent.getParameter("name") && oEvent.getParameter("name") !== "create") {
				oViewModel.setProperty("/enableCreate", false);
				this.getRouter().getTargets().detachDisplay(null, this._onDisplay, this);
				this.getView().unbindObject();
				return;
			}

			if (sap.ui.getCore().getMessageManager()) {
				sap.ui.getCore().getMessageManager().removeAllMessages();
			}

			this.removeNewItemsFromTable();
			this.getView().byId("lineItemsList").unbindItems();
			oViewModel.setProperty("/viewTitle", this._oResourceBundle.getText("createViewTitle"));
			var sTitle = this.getResourceBundle().getText("detailLineItemTableHeading");
			oViewModel.setProperty("/lineItemListTitle", sTitle);
			oViewModel.setProperty("/mode", "create");

			var oNewHeaderContext = this.getModel().createEntry("InvoiceHeaderentitySet", {
				"properties": {
					"InvType": "1",
					"Fstatus": ""
				}
			});

			var sPath = oNewHeaderContext.getPath();

			oViewModel.setProperty("/sObjectPath", sPath);
			/*Copy Email*/
			this._emailCust = "";
			this._addEmailCust = "";
			var oCommonModel = this.getModel("commonModel");
			oCommonModel.setProperty("/FinalLineItem", "00");
			oCommonModel.setProperty("/FinalAttachSeq", "0");
			oCommonModel.setProperty("/actionFromDetails", "");
			oCommonModel.setProperty("/actionFromLineItems", "");
			oCommonModel.setProperty("/Balance", 0);
			this.getView().unbindObject();
			oViewModel.setProperty("/busy", false);
			this.getView().setBindingContext(oNewHeaderContext);
			var oUploadCollection = this.getView().byId("InvoiceAttachmentsCollection");
			oUploadCollection.unbindItems();
			if (!this._oUploadTemplate) {
				this._oUploadTemplate = sap.ui.xmlfragment({
					fragmentName: "industry.gov.au.fi.arinv.view.UploadCollection",
					type: "XML",
					oController: this
				});
			}
			oUploadCollection.bindItems({
				path: sPath + "/Attachments",
				template: this._oUploadTemplate,
				suspended: true
			});
		},

		onSubmitRequest: function(oEven) {
			var oView = this.getView();
			var oModel = oView.getModel();
			var oViewModel = this.getModel("detailView");

			sap.ui.getCore().getMessageManager().removeAllMessages();

			var sNoError = this._mandatoryFieldValidations();

			if (sNoError === true) {
				var sQuestion = this._oResourceBundle.getText("submitRequestText");
				var sSuccessMessage = this._oResourceBundle.getText("submitRequestSuccess");

				var fnAfterSubmitted = function() {
					MessageToast.show(sSuccessMessage);
					oViewModel.setProperty("/busy", false);
				};

				var fnSubmit = function() {
					// Calls the oData Delete service
					this._callSubmit(fnAfterSubmitted);
				}.bind(this);

				var fnSubmitCancelled = function() {

				};

				MessageBox.show(sQuestion, {
					icon: MessageBox.Icon.WARNING,
					title: this._oResourceBundle.getText("submit"),
					actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
					onClose: function(oAction) {
						if (oAction === MessageBox.Action.OK) {
							fnSubmit();
						} else if (fnSubmitCancelled) {
							fnSubmitCancelled();
						}
					}
				});
			}

		},

		_callSubmit: function(fnAfterSubmitted) {
			var that = this;
			var oModel = this.getView().getModel();
			var detailViewModel = this.getView().getModel("detailView");
			this.getModel("appView").setProperty("/busy", true);

			if (!oModel.hasPendingChanges()) {
				// this.StartUpload();
				that._fnSubmitProcess();
			} else {
				if (detailViewModel.getProperty("/mode") === "edit" || detailViewModel.getProperty("/mode") === "create") {
					oModel.attachEventOnce("batchRequestCompleted", function(oEvent) {
						if (that._checkIfBatchRequestSucceeded(oEvent)) {
							that._fnSubmitProcess();
						} else {

							that.getModel("appView").setProperty("/busy", false);

							var errors = sap.ui.getCore().getMessageManager().getMessageModel().getData();

							errors.sort(function(a, b) {
								return (a.message > b.message) ? 1 : ((b.message > a.message) ? -1 : 0);
							});

							if (that._oMessagePopover) {
								that._oMessagePopover.destroy();
								that._oMessagePopover = null;
							}

							var obj = {};

							for (var i = 0, len = errors.length; i < len; i++)
								obj[errors[i]['message']] = errors[i];

							errors = new Array();

							for (var key in obj)
								errors.push(obj[key]);

							sap.ui.getCore().getMessageManager().getMessageModel().setData(errors);
						}
					});
				}
				oModel.submitChanges();
			}

		},

		_fnSubmitProcess: function() {
			this.onSave();
			var oView = this.getView();
			var oModel = oView.getModel();
			var sReqID = oView.getBindingContext().getProperty("UId");
			var oViewModel = oView.getModel("detailView");
			var oAppViewModel = oView.getModel("appView");
			var oContext = oView.getBindingContext();
			var that = this;
			var sComments = oView.getBindingContext().getProperty("SubmCmt");

			oViewModel.setProperty("/busy", true);

			oModel.callFunction("/UpdateStatus", {
				method: "POST",
				urlParameters: {
					"UId": sReqID,
					"Action": "REQ_SUBMIT",
					"Comments": sComments
				},

				context: null,
				success: function(oVendorDetails, response) {
					oViewModel.setProperty("/busy", false);
					oAppViewModel.setProperty("/busy", false);
					if (that._oMessagePopover) {
						that._oMessagePopover.destroy();
						that._oMessagePopover = null;
					}
					MessageToast.show("Request " + sReqID + " Submited Successfully");
					if (response.data.Messages) {
						var oMessage = new Message({
							message: response.data.Messages,
							type: MessageType.Success,
							target: "/Dummy"
						});

						sap.ui.getCore().getMessageManager().addMessages(oMessage);
						MessageBox.show(response.data.Messages, {
							icon: sap.m.MessageBox.Icon.SUCCESS,
							title: 'Success',
							actions: sap.m.MessageBox.Action.OK
						});
					} else {

						var oMessage = new Message({
							message: "Request " + sReqID + " Submited Successfully",
							type: MessageType.Success,
							target: "/Dummy"
						});

						sap.ui.getCore().getMessageManager().addMessages(oMessage);
					}
					that.getModel("appView").setProperty("/busy", false);
					that.getModel("detailView").setProperty("/mode", "display");
					that.getModel("appView").setProperty("/addEnabled", true);
					// oView.byId("editButton").setVisible(false);
					var sPath = oView.getBindingContext().getPath();

					var bReplace = !Device.system.phone;

					that.removeNewItemsFromTable();

					var oTable = that.getView().byId("lineItemsList");
					oTable.unbindItems();
					oTable.bindItems(sPath + "/Items", that._oTemplate);

					if (oView.getElementBinding()) {
						oView.getElementBinding().refresh();
					}

					that.getRouter().navTo("object", {
						UId: encodeURIComponent(oView.getBindingContext().getProperty("UId"))
					}, bReplace);

				},

				error: function(oError) {

					oViewModel.setProperty("/busy", false);
					oAppViewModel.setProperty("/busy", false);
					var sPath = oView.getBindingContext().getPath();


					that.removeNewItemsFromTable();

					var oTable = that.getView().byId("lineItemsList");
					oTable.unbindItems();
					oTable.bindItems(sPath + "/Items", that._oTemplate);

					if (oView.getElementBinding()) {
						oView.getElementBinding().refresh();
					}

				}
			});
			//	}			
		},

		onApproveRequest: function() {
			var oView = this.getView();
			var oModel = oView.getModel();
			var oViewModel = this.getModel("detailView");

			var sQuestion = this._oResourceBundle.getText("approvalRequestText");
			var sSuccessMessage = this._oResourceBundle.getText("approvalRequestSuccess");

			var fnAfterApproved = function() {
				MessageToast.show(sSuccessMessage);
				oViewModel.setProperty("/busy", false);
			};

			var fnApprove = function() {
				// Calls the oData Delete service
				this._callApproval(fnAfterApproved);
			}.bind(this);

			var fnApproveCancelled = function() {

			};

			MessageBox.show(sQuestion, {
				icon: MessageBox.Icon.WARNING,
				title: this._oResourceBundle.getText("approval"),
				actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
				onClose: function(oAction) {
					if (oAction === MessageBox.Action.OK) {
						fnApprove();
					} else if (fnApproveCancelled) {
						fnApproveCancelled();
					}
				}
			});
		},

		_callApproval: function(fnAfterApproved) {
			var that = this;
			var oModel = this.getView().getModel();
			var detailViewModel = this.getView().getModel("detailView");
			this.getModel("appView").setProperty("/busy", true);

			that._fnApprovalProcess();

		},

		_fnApprovalProcess: function() {
			var oView = this.getView();
			var oModel = oView.getModel();
			var sReqID = oView.getBindingContext().getProperty("UId");
			var oViewModel = oView.getModel("detailView");
			var oAppViewModel = oView.getModel("appView");
			var oContext = oView.getBindingContext();
			var sComments = oView.getBindingContext().getProperty("ApprCmt");
			var that = this;
			oViewModel.setProperty("/busy", true);

			oModel.callFunction("/UpdateStatus", {
				method: "POST",
				urlParameters: {
					"UId": sReqID,
					"Action": "REQ_APPR",
					"Comments": sComments
				},

				context: null,
				success: function(oVendorDetails, response) {
					oViewModel.setProperty("/busy", false);
					oAppViewModel.setProperty("/busy", false);
					MessageToast.show("Request Approved Successfully");

					var oMessage = new Message({
						message: "Request " + sReqID + " Approved Successfully",
						type: MessageType.Success,
						target: "/Dummy"
					});

					sap.ui.getCore().getMessageManager().addMessages(oMessage);
					if (oView.getElementBinding()) {
						oView.getElementBinding().refresh(true);
					}
					// that.fnRefreshPage(that,oView);
				},

				error: function(oError) {
					oViewModel.setProperty("/busy", false);
					oAppViewModel.setProperty("/busy", false);
				}
			});
			//	}			
		},

		onRejectRequest: function() {
			var oView = this.getView();
			var oModel = oView.getModel();
			var oViewModel = this.getModel("detailView");

			var sQuestion = this._oResourceBundle.getText("rejectionRequestText");
			var sSuccessMessage = this._oResourceBundle.getText("rejectionRequestSuccess");
			var sACField = oView.byId("apprCommentsArea");

			var fnAfterRejected = function() {
				MessageToast.show(sSuccessMessage);
				oViewModel.setProperty("/busy", false);
			};

			var fnReject = function() {
				// Calls the oData Delete service
				this._callRejection(fnAfterRejected);
			}.bind(this);

			var fnRejectCancelled = function() {

			};

			var dialog = new sap.m.Dialog({
				title: "Confirm",
				type: "Message",
				content: [
					new sap.m.Label({
						text: sQuestion,
						labelFor: "rejectDialogTextarea"
					}),
					new sap.m.TextArea("rejectDialogTextarea", {
						liveChange: function(oEvent) {
							var sText = oEvent.getParameter("value");
							var parent = oEvent.getSource().getParent();
							parent.getBeginButton().setEnabled(sText.length > 0);
						},
						width: "100%",
						placeholder: "Please provide Rejection comments."
					})
				],

				beginButton: new sap.m.Button({
					text: "Reject",
					enabled: false,
					press: function() {
						var sText = sap.ui.getCore().byId("rejectDialogTextarea").getValue();
						sACField.setValue(sText);
						fnReject();
						dialog.close();
					}
				}),

				endButton: new sap.m.Button({
					text: "Cancel",
					press: function() {
						dialog.close();
					}
				}),

				afterClose: function() {
					dialog.destroy();
				}
			});

			dialog.open();

		},

		_callRejection: function(fnAfterRejection) {
			var that = this;
			var oModel = this.getView().getModel();
			var detailViewModel = this.getView().getModel("detailView");
			this.getModel("appView").setProperty("/busy", true);

			that._fnRejectProcess();

		},

		_fnRejectProcess: function() {
			var oView = this.getView();
			var oModel = oView.getModel();
			var sReqID = oView.getBindingContext().getProperty("UId");
			var oViewModel = oView.getModel("detailView");
			var oAppViewModel = oView.getModel("appView");
			var oContext = oView.getBindingContext();
			var sComments = oView.getBindingContext().getProperty("ApprCmt");
			var that = this;
			//	if (sCompany !== "" && sVendor !== "") {

			oViewModel.setProperty("/busy", true);

			oModel.callFunction("/UpdateStatus", {
				method: "POST",
				urlParameters: {
					"UId": sReqID,
					"Action": "REQ_REJECT",
					"Comments": sComments
				},

				context: null,
				success: function(oVendorDetails, response) {
					oViewModel.setProperty("/busy", false);
					oAppViewModel.setProperty("/busy", false);
					MessageToast.show("Request Rejected Successfully");

					var oMessage = new Message({
						message: "Request " + sReqID + " Rejected Successfully",
						type: MessageType.Success,
						target: "/Dummy"
					});

					sap.ui.getCore().getMessageManager().addMessages(oMessage);
					if (oView.getElementBinding()) {
						oView.getElementBinding().refresh(true);
					}
					// that.fnRefreshPage(that,oView);
					
				},

				error: function(oError) {

					oViewModel.setProperty("/busy", false);
					oAppViewModel.setProperty("/busy", false);

				}
			});
			//	}			
		},

		onInvoiceAmountChange: function(oEvent) {
			var oLineItemTable = this.byId("lineItemsList");
			var oTableItems = oLineItemTable.getItems();
			//headerTotalAmount
			var sHeaderTotal = oEvent.getSource().getValue();
			var sLineItemsTotal = 0;
			var sBalance = 0;
			var ocommonModel = this.getModel("commonModel");
			var oTableItemContext = {};

			$.each(oTableItems, function(index, oTableItem) {
				oTableItemContext = oTableItem.getBindingContext();
				sLineItemsTotal = sLineItemsTotal + parseFloat(oTableItemContext.getProperty("Wrbtr"));
			});

			sBalance = sHeaderTotal - sLineItemsTotal;
			ocommonModel.setProperty("/Balance", sBalance);
		},

		onTableLipstUpdateStarted: function(oEvent) {

		},
		fnRefreshPage: function(that,oView) {
			that.getModel("appView").setProperty("/busy", false);
			that.getModel("detailView").setProperty("/mode", "display");
			that.getModel("appView").setProperty("/addEnabled", true);
			 
			var sPath = oView.getBindingContext().getPath();

			var bReplace = !Device.system.phone;

			that.removeNewItemsFromTable();

			var oTable = that.getView().byId("lineItemsList");
			oTable.unbindItems();
			oTable.bindItems(sPath + "/Items", that._oTemplate);

			if (oView.getElementBinding()) {
				oView.getElementBinding().refresh(true);
			}
			
			that.getRouter().navTo("object", {
				UId: encodeURIComponent(oView.getBindingContext().getProperty("UId"))
			}, bReplace);
		},
		onFb5lnLink: function(oEvent) {
			var oView = this.getView();
			var sCustomer = this.getView().byId("customerCode").getValue();
			var oModel = oView.getModel();
			if (!sCustomer) {
				sap.m.MessageBox.show("Please select a customer Number", {
					icon: sap.m.MessageBox.Icon.ERROR,
					title: "Customer Number Required",
					actions: sap.m.MessageBox.Action.OK
				});

				return;

			} else if (sCustomer === "") {
				sap.m.MessageBox.show("Please select a customer Number", {
					icon: sap.m.MessageBox.Icon.ERROR,
					title: "Customer Number Required",
					actions: sap.m.MessageBox.Action.OK
				});

				return;

			}
				var that = this;
				oModel.callFunction("/GetFBL5NURL", {
					method: "GET",
					urlParameters: {
						"Customer": sCustomer
					},

					context: null,
					success: function(oData, response) {
						if (response.data.url!=="") {
								MessageBox.show(response.data.url, {
									icon: sap.m.MessageBox.Icon.INFORMATION,
									title: 'Information',
									actions: sap.m.MessageBox.Action.OK
								});
						} else { 
							that.openLineItem(sCustomer);
						}	
					},
					error: function(oError) {

					}
				});
	
			

		},
		openLineItem : function(sCustomer){
		if (sap.ushell && sap.ushell.Container && sap.ushell.Container.getService) {
				var oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");
				oCrossAppNavigator.isNavigationSupported(
					[{
						semanticObject: "ZFBL5N",
						action: "lookup"
					}]).done(
					function(aResponse) {
						if (aResponse[0].supported == true) {
							oCrossAppNavigator.toExternal({
								target: {
									semanticObject: "ZFBL5N",
									action: "lookup"
								},
								params: {
									customer: sCustomer
								}
							});
						}
					});

			}	
		},
		_mandatoryFieldValidations: function() {

			var oContext = this.getView().getBindingContext();
			var sBukrs = oContext.getProperty("Bukrs");
			var sKunnr = oContext.getProperty("Kunnr");
			var sBldat = oContext.getProperty("Bldat");
			var sWrbtr = oContext.getProperty("Wrbtr");
			var sSubmCmt = oContext.getProperty("SubmCmt");
			var sRefundCmnt = oContext.getProperty("RefundCmnt");
			var sAdjCmnt = oContext.getProperty("AdjCmnt");
			var sInvType = oContext.getProperty("InvType");
			var oMessage = {};
			var sError = false;
			var sMessage = "";

			if (!sBukrs) {
				sError = true;
				sMessage = "Please enter Company Code.";
				this.onErrorPress(sMessage);
			}

			if (!sKunnr) {
				sError = true;
				sMessage = "Please enter Customer Number.";
				this.onErrorPress(sMessage);
			}

			if (!sBldat) {
				sError = true;
				sMessage = "Please enter date.";
				this.onErrorPress(sMessage);
			}

			if (!sWrbtr) {
				sError = true;
				sMessage = "Please enter Invoice amount.";
				this.onErrorPress(sMessage);
			}

			if (!sSubmCmt) {
				sError = true;
				sMessage = "Provide justification for this request (enter submission comments).";
				this.onErrorPress(sMessage);
			}

			if (sInvType === '2') {
				if (!sRefundCmnt) {
					sError = true;
					sMessage = "Please enter the Explanation.";
					this.onErrorPress(sMessage);
				}
			}

			if (sInvType === '3') {
				if (!sAdjCmnt) {
					sError = true;
					sMessage = "Please enter the Explanation.";
					this.onErrorPress(sMessage);
				}
			}

			//The Vendor Total Amount and Total of Line Item Amount are not same.
			if (sError === true) {

				sap.m.MessageBox.show(sMessage, {
					icon: sap.m.MessageBox.Icon.ERROR,
					title: "Value Required",
					actions: sap.m.MessageBox.Action.OK
				});

				return false;
			} else {
				return true;
			}

		},

		onCalculateInvoice: function() {
			var oView = this.getView();
			var sPath = oView.getBindingContext().getPath();
			var oModel = oView.getModel();
			var deepObject = oModel.getProperty(sPath);
			var oViewModel = oView.getModel("detailView");
			var oContext = this.getView().getBindingContext();
			var sBukrs = oContext.getProperty("Bukrs");
			var sMessage = "";

			if (!sBukrs) {
				sMessage = "Please enter Company Code.";
				this.onErrorPress(sMessage);

				sap.m.MessageBox.show(sMessage, {
					icon: sap.m.MessageBox.Icon.ERROR,
					title: "Value Required",
					actions: sap.m.MessageBox.Action.OK
				});

				return;
			}

			delete deepObject.Attachments;
			delete deepObject.InvoiceDefaults;
			delete deepObject.__metadata;

			var oLineItemTable = this.byId("lineItemsList");
			var oTableItems = oLineItemTable.getItems();
			deepObject.Items = [];
			var itemObject = {};
			//var oTableItemContext = {};

			$.each(oTableItems, function(index, oTableItem) {
				sPath = oTableItem.getBindingContext().getPath();
				itemObject = oModel.getProperty(sPath);
				delete itemObject.__metadata;

				deepObject.Items.push(itemObject);
			});

			oViewModel.setProperty("/busy", true);
		/*	var aDeferredGroup = oModel.getDeferredGroups().concat(["batchCreate"]);
			oModel.setDeferredGroups(aDeferredGroup);
			var mParameters = {
				groupId: "batchCreate"
			};
			 oModel.create("/InvoiceHeaderSet", oEntry, mParameters);
			 	$.each(aLineItems, function(index, oLineItem) {
					oModel.create("/InvoiceItemsSet", oLineItem, mParameters);	
				});*/
			oModel.create("/InvoiceHeaderentitySet", deepObject, {
				success: this._fnCalculateInvoiceSuccess.bind(this),
				error: this._fnCalculateInvoiceFailed.bind(this)
			});

		},

		_fnCalculateInvoiceSuccess: function(oData) {
			var oViewModel = this.getModel("detailView");
			var oModel = this.getModel();
			var sPath = "";
			var sLine = "";
			var sContext = {};

			oViewModel.setProperty("/busy", false);

			var oContext = this.getView().getBindingContext();

			if (!oContext.UId || oContext.UId === "") {
				oModel.setProperty("TotalIn", oData.TotalIn, oContext);
				oModel.setProperty("Gst", oData.Gst, oContext);
				oModel.setProperty("TotalEx", oData.TotalEx, oContext);
			}

			var oLineItemTable = this.byId("lineItemsList");
			var oTableItems = oLineItemTable.getItems();

			if (oData.Items) {
				if (oData.Items.results) {
					$.each(oTableItems, function(index, oTableItem) {
						sContext = oTableItem.getBindingContext();
						sLine = oTableItem.getBindingContext().getProperty("Buzei");

						$.each(oData.Items.results, function(resIndex, resItem) {
							if (parseInt(sLine, 10) === parseInt(resItem.Buzei, 10)) {
								oModel.setProperty("Hkont", resItem.Hkont, sContext);
								oModel.setProperty("Mwskz", resItem.Mwskz, sContext);
								/*Changes by Ram - to make model context forcefully changed to submit pending changes*/
								oModel.setProperty("Buzei", ""+parseInt(resItem.Buzei), sContext);
							}
						});
					});
				}
			}

		},

		/**
		 * Handles the failure of creating/updating an object
		 * @private
		 */
		_fnCalculateInvoiceFailed: function() {
			var oViewModel = this.getModel("detailView");
			oViewModel.setProperty("/busy", false);
		},

		onDeliveryMethodChange: function(oEvent) {
			var oModel = this.getView().getModel();
			var context = this.getView().getBindingContext();
			var delMethod = oEvent.getSource().getSelectedKey();
			if (delMethod === "MTC") {
				oModel.setProperty("EmailCust", "", context);
				oModel.setProperty("AddcustEmail", "", context);
			} else {
				oModel.setProperty("EmailCust", this._emailCust, context);
				oModel.setProperty("AddcustEmail", this._addEmailCust, context);
				if(delMethod === "EMTR" || delMethod === "MTRC"){
						MessageBox.show(this.getResourceBundle().getText("emailMessageAboutInvoice"), {
							icon: sap.m.MessageBox.Icon.INFORMATION,
							title: 'Information',
							actions: sap.m.MessageBox.Action.OK
						});
				}
			}
		}

	});
});