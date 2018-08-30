sap.ui.define([], function() {
	"use strict";

	return {
		/**
		 * Rounds the currency value to 2 digits
		 *
		 * @public
		 * @param {string} sValue value to be formatted
		 * @returns {string} formatted currency value with 2 digits
		 */
		currencyValue: function(sValue) {
			if (!sValue) {
				return "";
			}

			return parseFloat(sValue).toFixed(2);
		},

		getTableMode: function(sMode, sStatus) {
			if (sMode) {
				if ((sMode === "edit" || sMode === "create") && sStatus !== "REQ_SUBMIT" && sStatus !== "REQ_APPR" && sStatus !== "REQ_REJECT") {
					return "Delete";
				} else {
					return "None";
				}
			} else {
				return "None";
			}
		},

		getDetailViewTitle: function(sUId, sNewTitle) {
			if (sUId) {
				return sUId;
			} else {
				return sNewTitle;
			}
		},

		buildFileGetUrl: function(sUId, sZsequence) {
			return "/sap/opu/odata/sap/ZFI_AR_INVOICE_SRV/InvoiceAttachmentsentitySet(UId=\'" + sUId + "\',Line='" + sZsequence + "')/$value";
		},

		removeLeadingZeroes: function(sValue) {
			return parseInt(sValue, 10);

		},

		isEditable: function(sStatus, sMode) {
			if (sMode) {
				if ((sMode === "edit" || sMode === "create") && sStatus !== "REQ_SUBMIT" && sStatus !== "REQ_APPR" && sStatus !== "REQ_REJECT") {
					return true;
				} else {
					return false;
				}
			} else {
				return false;
			}
		},

		getDateAndTime: function(sDateTime) {

			if (sDateTime) {
				var dateTime = sDateTime.slice(6, 10);
				var finalDateTime = dateTime.concat(".", sDateTime.slice(4, 6), ".", sDateTime.slice(2, 4), " ", sDateTime.slice(10, 12), ":",
					sDateTime.slice(12, 14),
					":", sDateTime.slice(14, 16));

				return finalDateTime;
			} else {
				return "";
			}
		},

		getFlagText: function(sInvType) {
			if (sInvType === "1") {
				return "Does the invoice value exceed $1000?";
			} else if (sInvType === "2") {
				return "Does the refund exceed $30000 AUD?";
			} else if (sInvType === "3") {
				return "Does the Adjustment exceed $30000 AUD?";
			} else {
				return "Does the invoice value exceed $1000?";
			}
		},

		getLabelForAmount: function(sInvType) {
			if (sInvType === "1") {
				return "Invoice Amount (Incl GST)";
			} else if (sInvType === "2") {
				return "Refund Amount (Incl GST)";
			} else if (sInvType === "3") {
				return "Adjustment Amount (Incl GST)";
			} else {
				return "Invoice Amount";
			}
		},
		getLabelForOriginalInvoice: function(sInvType) {
			if (sInvType === "2") {
				return "Original Invoice/Receipt Number";
			} else if (sInvType === "3") {
				return "Original Invoice";
			} else {
				return "Original Invoice/Receipt Number";
			}
		}
		

	};

});